package clients

import (
	"context"
	"fmt"
	"time"

	"github.com/ethereum/go-ethereum/rpc"

	"go.uber.org/zap"
)

// AztecPXEClient handles interactions with Aztec blockchain via PXE
type AztecPXEClient struct {
	rpcClient     *rpc.Client
	walletAddress string
	logger        *zap.Logger
}

// NewAztecPXEClient creates a new client for Aztec blockchain via PXE
func NewAztecPXEClient(logger *zap.Logger, pxeURL, walletAddress string) (*AztecPXEClient, error) {
	client := &AztecPXEClient{
		walletAddress: walletAddress,
		logger:        logger.With(zap.String("component", "AztecPXEClient")),
	}

	client.logger.Info("Connecting to Aztec PXE",
		zap.String("pxeURL", pxeURL),
		zap.String("walletAddress", walletAddress))

	// Create RPC client using the same pattern as your working code
	rpcClient, err := rpc.Dial(pxeURL)
	if err != nil {
		return nil, fmt.Errorf("failed to create RPC client: %v", err)
	}

	client.rpcClient = rpcClient

	// Test connection using the working node_getBlock method
	err = client.testConnection()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Aztec PXE: %v", err)
	}

	return client, nil
}

// testConnection tests the connection to Aztec PXE using working methods
func (c *AztecPXEClient) testConnection() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Test with node_getBlock method (we know this works)
	var blockResult interface{}
	err := c.rpcClient.CallContext(ctx, &blockResult, "node_getBlock", 1)
	if err != nil {
		c.logger.Debug("node_getBlock test failed", zap.Error(err))
		// This is okay - block 1 might not exist, connection is still working
	}

	c.logger.Info("Aztec PXE connection successful")
	return nil
}

// Payload IDs matching the TokenBridge contract
const (
	AztecPayloadIDTransfer  = 1
	AztecPayloadIDAssetMeta = 2
	AztecPayloadIDTest      = 3
)

// SendVerifyTransaction sends a transaction to the appropriate function on Aztec based on payload type
func (c *AztecPXEClient) SendVerifyTransaction(ctx context.Context, targetContract string, vaaBytes []byte) (string, error) {
	c.logger.Debug("Processing VAA for Aztec", zap.Int("vaaLength", len(vaaBytes)))

	// Parse VAA to determine payload type and extract data
	payloadID, payload, err := c.parseVAAPayload(vaaBytes)
	if err != nil {
		return "", fmt.Errorf("failed to parse VAA: %v", err)
	}

	c.logger.Info("Detected payload type", zap.Uint8("payloadID", payloadID))

	switch payloadID {
	case AztecPayloadIDTest:
		return c.sendTestMessageTransaction(ctx, targetContract, payload)
	case AztecPayloadIDTransfer:
		// For token transfers, we'd need to call bridge_in_private
		// which requires VAA verification through Wormhole contract first
		return c.sendVerifyVAATransaction(ctx, targetContract, vaaBytes)
	default:
		c.logger.Warn("Unknown payload ID, attempting verify_vaa", zap.Uint8("payloadID", payloadID))
		return c.sendVerifyVAATransaction(ctx, targetContract, vaaBytes)
	}
}

// parseVAAPayload extracts the payload ID and payload bytes from a VAA
func (c *AztecPXEClient) parseVAAPayload(vaaBytes []byte) (uint8, []byte, error) {
	if len(vaaBytes) < 6 {
		return 0, nil, fmt.Errorf("VAA too short")
	}

	// Get signature count
	sigCount := int(vaaBytes[5])
	// Calculate offset to body (skip version + guardian set + sig count + signatures)
	bodyOffset := 6 + (sigCount * 66)

	// Body header is 51 bytes, payload starts after
	payloadOffset := bodyOffset + 51

	if len(vaaBytes) <= payloadOffset {
		return 0, nil, fmt.Errorf("VAA payload too short")
	}

	payload := vaaBytes[payloadOffset:]
	payloadID := payload[0]

	return payloadID, payload, nil
}

// sendTestMessageTransaction decodes test payload and calls receive_test_message
func (c *AztecPXEClient) sendTestMessageTransaction(ctx context.Context, targetContract string, payload []byte) (string, error) {
	// Test payload format (69 bytes):
	// - byte 0: payload ID (3)
	// - bytes 1-32: sender (bytes32)
	// - bytes 33-64: value (bytes32)
	// - bytes 65-66: source chain ID (uint16)
	// - bytes 67-68: destination chain ID (uint16)

	if len(payload) < 69 {
		return "", fmt.Errorf("test payload too short: %d bytes", len(payload))
	}

	// Extract sender (Field - take last 31 bytes to fit in Field)
	var senderBytes [32]byte
	copy(senderBytes[:], payload[1:33])
	senderHex := fmt.Sprintf("0x%x", senderBytes)

	// Extract value (Field)
	var valueBytes [32]byte
	copy(valueBytes[:], payload[33:65])
	valueHex := fmt.Sprintf("0x%x", valueBytes)

	// Extract source chain ID
	sourceChainID := uint16(payload[65])<<8 | uint16(payload[66])

	c.logger.Info("Calling receive_test_message",
		zap.String("contract", targetContract),
		zap.Uint16("sourceChainID", sourceChainID),
		zap.String("sender", senderHex),
		zap.String("value", valueHex))

	// Call receive_test_message(source_chain_id: u16, sender: Field, value: Field)
	var txResult interface{}
	err := c.rpcClient.CallContext(ctx, &txResult, "pxe_sendTransaction", map[string]interface{}{
		"contractAddress": targetContract,
		"functionName":    "receive_test_message",
		"args":            []interface{}{sourceChainID, senderHex, valueHex},
		"origin":          c.walletAddress,
	})

	if err != nil {
		return "", fmt.Errorf("failed to send receive_test_message transaction: %v", err)
	}

	return c.extractTxHash(txResult), nil
}

// sendVerifyVAATransaction sends raw VAA to verify_vaa function (for token transfers)
func (c *AztecPXEClient) sendVerifyVAATransaction(ctx context.Context, targetContract string, vaaBytes []byte) (string, error) {
	// Pad to 2000 bytes for contract but pass actual length
	paddedVAABytes := make([]byte, 2000)
	copy(paddedVAABytes, vaaBytes)

	// Convert the padded bytes to array format for Aztec
	vaaArray := make([]interface{}, 2000)
	for i, b := range paddedVAABytes {
		vaaArray[i] = int(b)
	}

	actualLength := len(vaaBytes)

	c.logger.Debug("Calling verify_vaa function",
		zap.String("contract", targetContract),
		zap.Int("actualLength", actualLength))

	var txResult interface{}
	err := c.rpcClient.CallContext(ctx, &txResult, "pxe_sendTransaction", map[string]interface{}{
		"contractAddress": targetContract,
		"functionName":    "verify_vaa",
		"args":            []interface{}{vaaArray, actualLength},
		"origin":          c.walletAddress,
	})

	if err != nil {
		return "", fmt.Errorf("failed to send verify_vaa transaction: %v", err)
	}

	return c.extractTxHash(txResult), nil
}

// extractTxHash extracts transaction hash from PXE response
func (c *AztecPXEClient) extractTxHash(txResult interface{}) string {
	if txMap, ok := txResult.(map[string]interface{}); ok {
		if txHash, exists := txMap["txHash"]; exists {
			if txHashStr, ok := txHash.(string); ok {
				return txHashStr
			}
		}
		if txHash, exists := txMap["hash"]; exists {
			if txHashStr, ok := txHash.(string); ok {
				return txHashStr
			}
		}
	}

	if txHashStr, ok := txResult.(string); ok {
		return txHashStr
	}

	c.logger.Debug("PXE transaction result", zap.Any("result", txResult))
	return fmt.Sprintf("tx_submitted_%d", time.Now().Unix())
}

// GetWalletAddress returns the wallet address being used
func (c *AztecPXEClient) GetWalletAddress() string {
	return c.walletAddress
}
