package clients

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"go.uber.org/zap"
)

// EVMClient handles interactions with EVM-compatible blockchains (Arbitrum)
type EVMClient struct {
	client     *ethclient.Client
	privateKey *ecdsa.PrivateKey
	address    common.Address
	logger     *zap.Logger
}

// NewEVMClient creates a new client for EVM-compatible blockchains
func NewEVMClient(logger *zap.Logger, rpcURL, privateKeyHex string) (*EVMClient, error) {
	client := &EVMClient{
		logger: logger.With(zap.String("component", "EVMClient")),
	}

	client.logger.Info("Connecting to EVM chain", zap.String("rpcURL", rpcURL))
	ethClient, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to EVM node: %v", err)
	}

	// Parse private key
	privateKey, err := crypto.HexToECDSA(strings.TrimPrefix(privateKeyHex, "0x"))
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %v", err)
	}

	// Derive public address
	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("error casting public key to ECDSA")
	}
	address := crypto.PubkeyToAddress(*publicKeyECDSA)

	client.client = ethClient
	client.privateKey = privateKey
	client.address = address

	return client, nil
}

// GetAddress returns the public address for this client
func (c *EVMClient) GetAddress() common.Address {
	return c.address
}

// Payload IDs matching the TokenBridge contract
const (
	PayloadIDTransfer  = 1
	PayloadIDAssetMeta = 2
	PayloadIDTest      = 3
)

// SendVerifyTransaction sends a transaction to the appropriate receive function based on payload type
func (c *EVMClient) SendVerifyTransaction(ctx context.Context, targetContract string, vaaBytes []byte) (string, error) {
	c.logger.Debug("Sending transaction to EVM", zap.Int("vaaLength", len(vaaBytes)))

	// Determine function to call based on payload ID
	// VAA structure: signatures + body, payload starts after header
	// We need to parse the VAA to get the payload, but for simplicity we'll just
	// try both functions - receiveTestMessage for test payloads, receiveTokens for transfers
	funcName := c.determineFunctionFromVAA(vaaBytes)

	// Contract ABI for TokenBridge receive functions
	const abiJSON = `[{
        "inputs": [
            {"internalType": "bytes", "name": "encodedVaa", "type": "bytes"}
        ],
        "name": "receiveTokens",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "bytes", "name": "encodedVaa", "type": "bytes"}
        ],
        "name": "receiveTestMessage",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }]`

	parsedABI, err := abi.JSON(strings.NewReader(abiJSON))
	if err != nil {
		return "", fmt.Errorf("ABI parse error: %v", err)
	}

	c.logger.Info("Calling function on TokenBridge", zap.String("function", funcName))

	// Pack the function call data
	data, err := parsedABI.Pack(funcName, vaaBytes)
	if err != nil {
		return "", fmt.Errorf("ABI pack error: %v", err)
	}

	// Get the latest nonce for our account
	nonce, err := c.client.PendingNonceAt(ctx, c.address)
	if err != nil {
		return "", fmt.Errorf("failed to get nonce: %v", err)
	}

	// Get the current gas price
	gasPrice, err := c.client.SuggestGasPrice(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get gas price: %v", err)
	}

	// Create the transaction
	targetAddr := common.HexToAddress(targetContract)
	tx := types.NewTransaction(
		nonce,
		targetAddr,
		big.NewInt(0), // No ETH being sent
		3000000,       // Gas limit - adjust as needed
		gasPrice,
		data,
	)

	// Get the chain ID
	chainID, err := c.client.NetworkID(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get chain ID: %v", err)
	}

	// Sign the transaction
	signedTx, err := types.SignTx(tx, types.NewEIP155Signer(chainID), c.privateKey)
	if err != nil {
		return "", fmt.Errorf("failed to sign transaction: %v", err)
	}

	// Send the transaction
	err = c.client.SendTransaction(ctx, signedTx)
	if err != nil {
		return "", fmt.Errorf("failed to send transaction: %v", err)
	}

	return signedTx.Hash().Hex(), nil
}

// determineFunctionFromVAA parses the VAA to determine which receive function to call
func (c *EVMClient) determineFunctionFromVAA(vaaBytes []byte) string {
	// VAA structure:
	// - 1 byte: version
	// - 4 bytes: guardian set index
	// - 1 byte: signature count (N)
	// - N * 66 bytes: signatures
	// - Body (after signatures):
	//   - 4 bytes: timestamp
	//   - 4 bytes: nonce
	//   - 2 bytes: emitter chain
	//   - 32 bytes: emitter address
	//   - 8 bytes: sequence
	//   - 1 byte: consistency level
	//   - payload...

	if len(vaaBytes) < 6 {
		c.logger.Warn("VAA too short, defaulting to receiveTokens")
		return "receiveTokens"
	}

	// Get signature count
	sigCount := int(vaaBytes[5])
	// Calculate offset to body (skip version + guardian set + sig count + signatures)
	bodyOffset := 6 + (sigCount * 66)

	// Body header is 51 bytes (4+4+2+32+8+1), payload starts after
	payloadOffset := bodyOffset + 51

	if len(vaaBytes) <= payloadOffset {
		c.logger.Warn("VAA payload too short, defaulting to receiveTokens")
		return "receiveTokens"
	}

	payloadID := vaaBytes[payloadOffset]
	c.logger.Debug("Detected payload ID", zap.Uint8("payloadID", payloadID))

	switch payloadID {
	case PayloadIDTest:
		return "receiveTestMessage"
	case PayloadIDTransfer:
		return "receiveTokens"
	default:
		c.logger.Warn("Unknown payload ID, defaulting to receiveTokens", zap.Uint8("payloadID", payloadID))
		return "receiveTokens"
	}
}
