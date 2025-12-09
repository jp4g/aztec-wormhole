package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"go.uber.org/zap"

	"github.com/NethermindEth/aztec-wormhole-app-demo/go-relayer/internal"
	"github.com/NethermindEth/aztec-wormhole-app-demo/go-relayer/internal/clients"
	"github.com/NethermindEth/aztec-wormhole-app-demo/go-relayer/internal/submitter"
)

const (
	// Default configuration values
	DefaultAztecPXEURL            = "http://localhost:8090"
	DefaultAztecWalletAddress     = "0x2cbb9658b8b0fe662f5bc00424b8c6f440d125e2141bfa9a878219d14591a469"
	DefaultAztecTargetContract    = "0x12216055e8771f01db45d2b0282ae81298a2c0d1125e76da42aff0fa228fc642" // TokenBridge on Aztec
	DefaultVerificationServiceURL = "http://localhost:8080"
	DefaultArbitrumChainIDForAztec = uint16(10003) // Arbitrum Sepolia Wormhole chain ID (source for Aztec relay)
)

// aztecCmd represents the command to relay VAAs to Aztec
var aztecCmd = &cobra.Command{
	Use:   "aztec",
	Short: "Relay Wormhole VAAs from EVM chains to Aztec",
	Long: `Listens for Wormhole VAAs from EVM chains and relays them to Aztec.

This command monitors the Wormhole network for messages from the specified
source chain and submits them to the Aztec network via PXE.`,
	PreRun: func(cmd *cobra.Command, args []string) {
		printBanner()
		configureLogging(cmd, args)
	},
	RunE: runAztecRelay,
}

func init() {
	rootCmd.AddCommand(aztecCmd)

	// Aztec-specific flags
	aztecCmd.Flags().String(
		"aztec-pxe-url",
		DefaultAztecPXEURL,
		"PXE URL for Aztec")

	aztecCmd.Flags().String(
		"aztec-wallet-address",
		DefaultAztecWalletAddress,
		"Aztec wallet address to use")

	aztecCmd.Flags().String(
		"aztec-target-contract",
		DefaultAztecTargetContract,
		"Target contract on Aztec to send VAAs to")

	aztecCmd.Flags().String(
		"verification-service-url",
		DefaultVerificationServiceURL,
		"Verification service URL (optional)")

	aztecCmd.PersistentFlags().Uint16("chain-id", DefaultArbitrumChainIDForAztec, "Source chain ID to listen for (Arbitrum Sepolia = 10003)")

	// Bind flags to viper
	viper.BindPFlag("aztec_pxe_url", aztecCmd.Flags().Lookup("aztec-pxe-url"))
	viper.BindPFlag("aztec_wallet_address", aztecCmd.Flags().Lookup("aztec-wallet-address"))
	viper.BindPFlag("aztec_target_contract", aztecCmd.Flags().Lookup("aztec-target-contract"))
	viper.BindPFlag("verification_service_url", aztecCmd.Flags().Lookup("verification-service-url"))
	viper.BindPFlag("chain_id", aztecCmd.PersistentFlags().Lookup("chain-id"))
}

type AztecConfig struct {
	SpyRPCHost          string // Wormhole spy service endpoint
	ChainID             uint16 // Aztec chain ID
	AztecPXEURL         string // PXE URL for Aztec
	AztecWalletAddress  string // Aztec wallet address to use
	AztecTargetContract string

	VerificationServiceURL string // Optional verification service URL
}

func runAztecRelay(cmd *cobra.Command, args []string) error {
	logger := configureLogging(cmd, args)
	logger.Info("Starting Aztec relayer (EVM -> Aztec)")

	config := AztecConfig{
		SpyRPCHost:             viper.GetString("spy_rpc_host"),
		ChainID:                uint16(viper.GetInt("chain_id")),
		AztecPXEURL:            viper.GetString("aztec_pxe_url"),
		AztecWalletAddress:     viper.GetString("aztec_wallet_address"),
		AztecTargetContract:    viper.GetString("aztec_target_contract"),
		VerificationServiceURL: viper.GetString("verification_service_url"),
	}

	logger.Info("Configuration",
		zap.String("spyRPC", config.SpyRPCHost),
		zap.Uint16("chainId", config.ChainID),
		zap.String("aztecPXE", config.AztecPXEURL),
		zap.String("aztecWallet", config.AztecWalletAddress),
		zap.String("aztecTarget", config.AztecTargetContract))

	spyClient, err := clients.NewSpyClient(logger, config.SpyRPCHost)
	if err != nil {
		return fmt.Errorf("failed to create spy client: %v", err)
	}

	pxeClient, err := clients.NewAztecPXEClient(
		logger, config.AztecPXEURL, config.AztecWalletAddress)
	if err != nil {
		return fmt.Errorf("failed to create PXE client: %v", err)
	}

	verificationService := clients.NewVerificationServiceClient(logger, config.VerificationServiceURL)

	submitter := submitter.NewAztecSubmitter(logger,
		config.AztecTargetContract, pxeClient, verificationService)
	vaaProcessor := internal.NewDefaultVAAProcessor(logger, internal.VAAProcessorConfig{ChainID: config.ChainID}, submitter)

	// Create and start relayer
	relayer, err := internal.NewRelayer(logger, spyClient, vaaProcessor)
	if err != nil {
		return fmt.Errorf("failed to initialize relayer: %v", err)
	}
	defer relayer.Close()

	// Setup context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-c
		logger.Info("Received shutdown signal")
		cancel()
	}()

	// Start the relayer
	if err := relayer.Start(ctx); err != nil {
		return fmt.Errorf("relayer stopped with error: %v", err)
	}

	return nil
}
