package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"

	spyv1 "github.com/certusone/wormhole/node/pkg/proto/spy/v1"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

// Global logger
var logger *zap.Logger

func initLogger() {
	var err error
	logLevel := os.Getenv("LOG_LEVEL")

	var config zap.Config
	if logLevel == "debug" {
		config = zap.NewDevelopmentConfig()
		config.Level = zap.NewAtomicLevelAt(zap.DebugLevel)
	} else {
		config = zap.NewProductionConfig()
		if logLevel == "info" {
			config.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
		} else {
			config.Level = zap.NewAtomicLevelAt(zap.WarnLevel)
		}
	}

	logger, err = config.Build()
	if err != nil {
		panic(fmt.Sprintf("failed to initialize logger: %v", err))
	}
}

// MockSpyServer implements the Wormhole spy gRPC interface
type MockSpyServer struct {
	spyv1.UnimplementedSpyRPCServiceServer
	logger      *zap.Logger
	subscribers []chan []byte
	subMux      sync.RWMutex
}

func NewMockSpyServer() *MockSpyServer {
	return &MockSpyServer{
		logger:      logger.With(zap.String("component", "MockSpyServer")),
		subscribers: make([]chan []byte, 0),
	}
}

// SubscribeSignedVAA implements the spy's gRPC interface
func (s *MockSpyServer) SubscribeSignedVAA(
	req *spyv1.SubscribeSignedVAARequest,
	stream spyv1.SpyRPCService_SubscribeSignedVAAServer,
) error {
	s.logger.Info("New relayer subscription")

	// Create a channel for this subscriber
	subChan := make(chan []byte, 100)

	// Register subscriber
	s.subMux.Lock()
	s.subscribers = append(s.subscribers, subChan)
	subscriberIndex := len(s.subscribers) - 1
	s.subMux.Unlock()

	// Cleanup on disconnect
	defer func() {
		s.subMux.Lock()
		close(subChan)
		s.subscribers = append(s.subscribers[:subscriberIndex], s.subscribers[subscriberIndex+1:]...)
		s.subMux.Unlock()
		s.logger.Info("Relayer disconnected")
	}()

	// Stream VAAs to this subscriber
	for {
		select {
		case <-stream.Context().Done():
			return stream.Context().Err()
		case vaaBytes := <-subChan:
			if err := stream.Send(&spyv1.SubscribeSignedVAAResponse{
				VaaBytes: vaaBytes,
			}); err != nil {
				s.logger.Error("Failed to send VAA to subscriber", zap.Error(err))
				return err
			}
			s.logger.Debug("Streamed VAA to relayer", zap.Int("size", len(vaaBytes)))
		}
	}
}

// BroadcastVAA sends a VAA to all connected subscribers
func (s *MockSpyServer) BroadcastVAA(vaaBytes []byte) {
	s.subMux.RLock()
	defer s.subMux.RUnlock()

	s.logger.Info("Broadcasting VAA to subscribers",
		zap.Int("subscribers", len(s.subscribers)),
		zap.Int("vaaSize", len(vaaBytes)))

	for _, subChan := range s.subscribers {
		select {
		case subChan <- vaaBytes:
			// Successfully sent
		default:
			s.logger.Warn("Subscriber channel full, dropping VAA")
		}
	}
}

// VAARequest is the HTTP request body for submitting VAAs
type VAARequest struct {
	VAABytes string `json:"vaaBytes"` // Hex-encoded VAA
}

// HTTPServer handles HTTP requests to submit VAAs
type HTTPServer struct {
	spyServer *MockSpyServer
	logger    *zap.Logger
}

func NewHTTPServer(spyServer *MockSpyServer) *HTTPServer {
	return &HTTPServer{
		spyServer: spyServer,
		logger:    logger.With(zap.String("component", "HTTPServer")),
	}
}

func (h *HTTPServer) handleSubmitVAA(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req VAARequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.logger.Error("Failed to decode request", zap.Error(err))
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Decode hex VAA
	vaaBytes, err := hex.DecodeString(req.VAABytes)
	if err != nil {
		h.logger.Error("Failed to decode VAA hex", zap.Error(err))
		http.Error(w, "Invalid VAA hex encoding", http.StatusBadRequest)
		return
	}

	h.logger.Info("Received VAA via HTTP",
		zap.Int("size", len(vaaBytes)),
		zap.String("vaaHex", req.VAABytes[:min(64, len(req.VAABytes))]))

	// Broadcast to all subscribers
	h.spyServer.BroadcastVAA(vaaBytes)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "VAA submitted successfully",
	})
}

func (h *HTTPServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "healthy",
	})
}

func (h *HTTPServer) Start(port string) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/submit-vaa", h.handleSubmitVAA)
	mux.HandleFunc("/health", h.handleHealth)

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	h.logger.Info("Starting HTTP server", zap.String("port", port))
	return server.ListenAndServe()
}

func main() {
	initLogger()
	defer logger.Sync()

	logger.Info("Starting Wormhole Mock Spy Service")

	// Get configuration from environment
	grpcPort := getEnvOrDefault("GRPC_PORT", "7073")
	httpPort := getEnvOrDefault("HTTP_PORT", "8081")

	// Create mock spy server
	spyServer := NewMockSpyServer()

	// Start gRPC server
	grpcListener, err := net.Listen("tcp", ":"+grpcPort)
	if err != nil {
		logger.Fatal("Failed to listen on gRPC port",
			zap.String("port", grpcPort),
			zap.Error(err))
	}

	grpcServer := grpc.NewServer()
	spyv1.RegisterSpyRPCServiceServer(grpcServer, spyServer)

	// Start gRPC server in goroutine
	go func() {
		logger.Info("Starting gRPC server", zap.String("port", grpcPort))
		if err := grpcServer.Serve(grpcListener); err != nil {
			logger.Fatal("gRPC server failed", zap.Error(err))
		}
	}()

	// Start HTTP server in goroutine
	httpServer := NewHTTPServer(spyServer)
	go func() {
		if err := httpServer.Start(httpPort); err != nil {
			logger.Fatal("HTTP server failed", zap.Error(err))
		}
	}()

	logger.Info("Mock Spy Service running",
		zap.String("grpcPort", grpcPort),
		zap.String("httpPort", httpPort))

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.Info("Shutting down gracefully...")

	// Graceful shutdown
	grpcServer.GracefulStop()

	logger.Info("Shutdown complete")
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
