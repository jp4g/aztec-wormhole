// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.20;

import {IWormhole} from "wormhole/ethereum/contracts/interfaces/IWormhole.sol";
import {IBridgedToken} from "../Interfaces/IBridgedToken.sol";
import {TokenBridgeGetters} from "./TokenBridgeGetters.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TokenBridge
 * @dev General-purpose token bridge using Wormhole for cross-chain transfers.
 *
 * Supports two token types:
 * - Native tokens: Locked on source chain, minted (as wrapped) on destination
 * - Bridged tokens: Burned on source chain, unlocked (or minted) on destination
 *
 * Payload format (165 bytes):
 * - bytes1:   payloadId (1 = token transfer)
 * - bytes32:  sourceToken (token address on source chain)
 * - bytes32:  destinationToken (token address on destination chain)
 * - bytes32:  sender (original sender address)
 * - bytes32:  recipient (destination recipient address)
 * - uint256:  amount (32 bytes, normalized to 8 decimals)
 * - uint16:   sourceChainId
 * - uint16:   destinationChainId
 */
contract TokenBridge is TokenBridgeGetters {
    using SafeERC20 for IERC20;

    // Payload ID for token transfers
    uint8 public constant PAYLOAD_ID_TRANSFER = 1;

    // Payload ID for asset metadata registration
    uint8 public constant PAYLOAD_ID_ASSET_META = 2;

    // Payload ID for test messages
    uint8 public constant PAYLOAD_ID_TEST = 3;

    // Decimals used for cross-chain normalization
    uint8 public constant NORMALIZED_DECIMALS = 8;

    // Events
    event EmitterRegistered(uint16 indexed chainId, bytes32 emitterAddress);
    event TokenConfigured(address indexed token, bool enabled, bool isNative, uint8 decimals);
    event RemoteTokenConfigured(address indexed localToken, uint16 indexed remoteChainId, bytes32 remoteToken);
    event TokensBridged(
        address indexed token,
        address indexed sender,
        bytes32 recipient,
        uint256 amount,
        uint16 destinationChainId,
        uint64 sequence
    );
    event TokensReceived(
        address indexed token,
        bytes32 indexed sender,
        address recipient,
        uint256 amount,
        uint16 sourceChainId,
        bytes32 vaaHash
    );
    event AssetMetaPublished(
        address indexed token,
        uint16 tokenChain,
        uint8 decimals,
        bytes32 symbol,
        bytes32 name,
        uint64 sequence
    );
    event TestMessageSent(
        address indexed sender,
        uint16 destinationChainId,
        uint256 value,
        uint64 sequence
    );
    event TestMessageReceived(
        uint16 indexed sourceChainId,
        bytes32 indexed sender,
        uint256 value
    );

    /**
     * @dev Struct to hold decoded transfer parameters (avoids stack too deep)
     */
    struct TransferParams {
        bytes32 sourceToken;
        bytes32 destinationToken;
        bytes32 sender;
        bytes32 recipient;
        uint256 normalizedAmount;
        uint16 sourceChainId;
        uint16 destinationChainId;
    }

    /**
     * @param wormholeAddr_ Address of the Wormhole core contract
     * @param chainId_ Wormhole chain ID for this bridge
     * @param evmChainId_ Native EVM chain ID
     * @param finality_ Consistency level for outbound messages
     */
    constructor(
        address payable wormholeAddr_,
        uint16 chainId_,
        uint256 evmChainId_,
        uint8 finality_
    ) TokenBridgeGetters(wormholeAddr_, chainId_, evmChainId_, finality_) {}

    // ============ Admin Functions ============

    /**
     * @notice Register an emitter from a remote chain
     * @param remoteChainId Wormhole chain ID of the remote chain
     * @param emitterAddress Emitter address as bytes32
     */
    function registerEmitter(uint16 remoteChainId, bytes32 emitterAddress) external onlyOwner {
        require(emitterAddress != bytes32(0), "Emitter cannot be zero");
        _state.registeredEmitters[remoteChainId] = emitterAddress;
        emit EmitterRegistered(remoteChainId, emitterAddress);
    }

    /**
     * @notice Configure a token for bridging
     * @param token Local token address
     * @param enabled Whether the token is enabled for bridging
     * @param isNative True if native (lock/unlock), false if bridged (mint/burn)
     * @param decimals Token decimals for normalization
     */
    function setTokenConfig(
        address token,
        bool enabled,
        bool isNative,
        uint8 decimals
    ) external onlyOwner {
        require(token != address(0), "Token cannot be zero address");
        _state.tokenConfigs[token] = TokenConfig({
            enabled: enabled,
            isNative: isNative,
            decimals: decimals
        });
        emit TokenConfigured(token, enabled, isNative, decimals);
    }

    /**
     * @notice Configure remote token mapping
     * @param localToken Local token address
     * @param remoteChainId Wormhole chain ID of the remote chain
     * @param remoteToken Token address on the remote chain (as bytes32)
     * @param enabled Whether bridging to this remote is enabled
     */
    function setRemoteToken(
        address localToken,
        uint16 remoteChainId,
        bytes32 remoteToken,
        bool enabled
    ) external onlyOwner {
        require(localToken != address(0), "Local token cannot be zero");
        _state.remoteTokens[localToken][remoteChainId] = RemoteTokenInfo({
            remoteToken: remoteToken,
            enabled: enabled
        });
        emit RemoteTokenConfigured(localToken, remoteChainId, remoteToken);
    }

    // ============ Bridge Functions ============

    /**
     * @notice Bridge tokens to a remote chain
     * @param token Local token address
     * @param amount Amount to bridge (in local token decimals)
     * @param destinationChainId Wormhole chain ID of the destination
     * @param recipient Recipient address on destination chain (as bytes32)
     * @return sequence The Wormhole sequence number for this message
     */
    function bridgeTokens(
        address token,
        uint256 amount,
        uint16 destinationChainId,
        bytes32 recipient
    ) external payable returns (uint64 sequence) {
        require(!isFork(), "Cannot bridge on forked chain");
        require(amount > 0, "Amount must be greater than zero");
        require(recipient != bytes32(0), "Recipient cannot be zero");

        // Check token is enabled
        TokenConfig memory config = _state.tokenConfigs[token];
        require(config.enabled, "Token not enabled for bridging");

        // Check remote token is configured
        RemoteTokenInfo memory remoteInfo = _state.remoteTokens[token][destinationChainId];
        require(remoteInfo.enabled, "Remote token not enabled");

        // Handle token transfer/burn
        if (config.isNative) {
            // Native token: lock in bridge
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        } else {
            // Bridged token: burn from sender
            IBridgedToken(token).burnFrom(msg.sender, amount);
        }

        // Normalize amount for cross-chain transfer
        uint256 normalizedAmount = _normalizeAmount(amount, config.decimals);

        // Encode the payload
        bytes memory payload = _encodeTransferPayload(
            _addressToBytes32(token),
            remoteInfo.remoteToken,
            _addressToBytes32(msg.sender),
            recipient,
            normalizedAmount,
            chainId(),
            destinationChainId
        );

        // Get the message fee
        uint256 messageFee = wormhole().messageFee();
        require(msg.value >= messageFee, "Insufficient fee for Wormhole message");

        // Publish the message
        sequence = wormhole().publishMessage{value: messageFee}(
            _state.outboundNonce,
            payload,
            finality()
        );

        // Increment nonce
        _state.outboundNonce++;

        // Refund excess fee
        if (msg.value > messageFee) {
            (bool success, ) = msg.sender.call{value: msg.value - messageFee}("");
            require(success, "Fee refund failed");
        }

        emit TokensBridged(token, msg.sender, recipient, amount, destinationChainId, sequence);
    }

    /**
     * @notice Receive tokens from a remote chain via VAA
     * @param encodedVaa The encoded VAA from Wormhole guardians
     */
    function receiveTokens(bytes calldata encodedVaa) external {
        require(!isFork(), "Cannot receive on forked chain");

        // Parse and verify the VAA
        (IWormhole.VM memory vm, bool valid, string memory reason) = wormhole().parseAndVerifyVM(encodedVaa);
        require(valid, reason);

        // Check emitter is registered
        require(
            _state.registeredEmitters[vm.emitterChainId] == vm.emitterAddress,
            "Unknown emitter"
        );

        // Check VAA hasn't been processed (replay protection)
        require(!_state.processedVaas[vm.hash], "VAA already processed");
        _state.processedVaas[vm.hash] = true;

        // Process the payload and execute transfer
        _processIncomingTransfer(vm.payload, vm.hash);
    }

    /**
     * @dev Process incoming transfer payload
     */
    function _processIncomingTransfer(bytes memory payload, bytes32 vaaHash) internal {
        // Decode only the fields we need
        TransferParams memory params = _decodeTransferParams(payload);

        // Verify destination chain
        require(params.destinationChainId == chainId(), "Wrong destination chain");

        // Convert to addresses
        address recipientAddr = _bytes32ToAddress(params.recipient);
        address localToken = _bytes32ToAddress(params.destinationToken);

        // Verify token is configured and get config
        TokenConfig memory config = _state.tokenConfigs[localToken];
        require(config.enabled, "Token not enabled");

        // Denormalize amount and execute transfer
        uint256 amount = _denormalizeAmount(params.normalizedAmount, config.decimals);
        _executeIncomingTransfer(localToken, recipientAddr, amount, config.isNative);

        emit TokensReceived(localToken, params.sender, recipientAddr, amount, params.sourceChainId, vaaHash);
    }

    /**
     * @dev Execute the incoming token transfer (mint or unlock)
     */
    function _executeIncomingTransfer(
        address token,
        address recipient,
        uint256 amount,
        bool isNative
    ) internal {
        if (isNative) {
            // Native token: unlock from bridge
            IERC20(token).safeTransfer(recipient, amount);
        } else {
            // Bridged token: mint to recipient
            IBridgedToken(token).mint(recipient, amount);
        }
    }

    // ============ Test Message Functions ============

    /**
     * @notice Send a test message to a remote chain
     * @param destinationChainId Wormhole chain ID of the destination
     * @param value The test value to send
     * @return sequence The Wormhole sequence number
     */
    function sendTestMessage(
        uint16 destinationChainId,
        uint256 value
    ) external payable returns (uint64 sequence) {
        require(!isFork(), "Cannot send on forked chain");

        bytes memory payload = abi.encodePacked(
            PAYLOAD_ID_TEST,
            _addressToBytes32(msg.sender),
            value,
            chainId(),
            destinationChainId
        );

        uint256 messageFee = wormhole().messageFee();
        require(msg.value >= messageFee, "Insufficient fee");

        sequence = wormhole().publishMessage{value: messageFee}(
            _state.outboundNonce,
            payload,
            finality()
        );

        _state.outboundNonce++;

        if (msg.value > messageFee) {
            (bool success, ) = msg.sender.call{value: msg.value - messageFee}("");
            require(success, "Fee refund failed");
        }

        emit TestMessageSent(msg.sender, destinationChainId, value, sequence);
    }

    /**
     * @notice Receive a test message from a remote chain
     * @param encodedVaa The encoded VAA from Wormhole guardians
     */
    function receiveTestMessage(bytes calldata encodedVaa) external {
        require(!isFork(), "Cannot receive on forked chain");

        (IWormhole.VM memory vm, bool valid, string memory reason) = wormhole().parseAndVerifyVM(encodedVaa);
        require(valid, reason);

        require(
            _state.registeredEmitters[vm.emitterChainId] == vm.emitterAddress,
            "Unknown emitter"
        );

        require(!_state.processedVaas[vm.hash], "VAA already processed");
        _state.processedVaas[vm.hash] = true;

        // Decode test message payload
        require(vm.payload.length >= 69, "Invalid test payload length");
        uint8 payloadId = uint8(vm.payload[0]);
        require(payloadId == PAYLOAD_ID_TEST, "Not a test message");

        bytes32 sender;
        uint256 value;
        uint16 sourceChainId;
        uint16 destChainId;

        assembly {
            let payload := mload(add(vm, 128)) // vm.payload offset
            sender := mload(add(add(payload, 32), 1))
            value := mload(add(add(payload, 32), 33))
            sourceChainId := shr(240, mload(add(add(payload, 32), 65)))
            destChainId := shr(240, mload(add(add(payload, 32), 67)))
        }

        require(destChainId == chainId(), "Wrong destination chain");

        _state.lastReceivedValue = value;
        _state.lastReceivedFromChain = sourceChainId;
        _state.lastReceivedSender = sender;

        emit TestMessageReceived(sourceChainId, sender, value);
    }

    /**
     * @notice Get the last received test message data
     */
    function getLastTestMessage() external view returns (uint256 value, uint16 fromChain, bytes32 sender) {
        return (_state.lastReceivedValue, _state.lastReceivedFromChain, _state.lastReceivedSender);
    }

    // ============ Asset Meta Functions ============

    /**
     * @notice Publish asset metadata for a token to remote chains
     * @param token Local token address
     * @param symbol Token symbol (max 32 bytes)
     * @param name Token name (max 32 bytes)
     * @return sequence The Wormhole sequence number for this message
     */
    function publishAssetMeta(
        address token,
        bytes32 symbol,
        bytes32 name
    ) external payable onlyOwner returns (uint64 sequence) {
        require(!isFork(), "Cannot publish on forked chain");

        TokenConfig memory config = _state.tokenConfigs[token];
        require(config.enabled, "Token not configured");

        bytes memory payload = _encodeAssetMetaPayload(
            _addressToBytes32(token),
            chainId(),
            config.decimals,
            symbol,
            name
        );

        uint256 messageFee = wormhole().messageFee();
        require(msg.value >= messageFee, "Insufficient fee");

        sequence = wormhole().publishMessage{value: messageFee}(
            _state.outboundNonce,
            payload,
            finality()
        );

        _state.outboundNonce++;

        if (msg.value > messageFee) {
            (bool success, ) = msg.sender.call{value: msg.value - messageFee}("");
            require(success, "Fee refund failed");
        }

        emit AssetMetaPublished(token, chainId(), config.decimals, symbol, name, sequence);
    }

    // ============ Internal Functions ============

    /**
     * @dev Encode a transfer payload
     */
    function _encodeTransferPayload(
        bytes32 sourceToken,
        bytes32 destinationToken,
        bytes32 sender,
        bytes32 recipient,
        uint256 amount,
        uint16 sourceChainId,
        uint16 destinationChainId
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            PAYLOAD_ID_TRANSFER,
            sourceToken,
            destinationToken,
            sender,
            recipient,
            amount,
            sourceChainId,
            destinationChainId
        );
    }

    /**
     * @dev Encode an asset meta payload (100 bytes)
     */
    function _encodeAssetMetaPayload(
        bytes32 tokenAddress,
        uint16 tokenChain,
        uint8 decimals,
        bytes32 symbol,
        bytes32 name
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            PAYLOAD_ID_ASSET_META,
            tokenAddress,
            tokenChain,
            decimals,
            symbol,
            name
        );
    }

    /**
     * @dev Decode a transfer payload into a struct (avoids stack too deep)
     */
    function _decodeTransferParams(bytes memory payload) internal pure returns (TransferParams memory params) {
        require(payload.length == 165, "Invalid payload length");

        uint8 payloadId;
        assembly {
            payloadId := mload(add(payload, 1))
        }
        require(payloadId == PAYLOAD_ID_TRANSFER, "Invalid payload ID");

        assembly {
            // Store directly into the struct in memory
            // params is a pointer to the struct, fields are at offsets 0x00, 0x20, 0x40, etc.
            mstore(params, mload(add(payload, 33)))           // sourceToken at offset 0
            mstore(add(params, 0x20), mload(add(payload, 65))) // destinationToken at offset 32
            mstore(add(params, 0x40), mload(add(payload, 97))) // sender at offset 64
            mstore(add(params, 0x60), mload(add(payload, 129))) // recipient at offset 96
            mstore(add(params, 0x80), mload(add(payload, 161))) // normalizedAmount at offset 128
            mstore(add(params, 0xa0), shr(240, mload(add(payload, 193)))) // sourceChainId at offset 160
            mstore(add(params, 0xc0), shr(240, mload(add(payload, 195)))) // destinationChainId at offset 192
        }
    }

    /**
     * @dev Normalize amount to 8 decimals for cross-chain transfer
     */
    function _normalizeAmount(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        if (decimals > NORMALIZED_DECIMALS) {
            return amount / (10 ** (decimals - NORMALIZED_DECIMALS));
        } else if (decimals < NORMALIZED_DECIMALS) {
            return amount * (10 ** (NORMALIZED_DECIMALS - decimals));
        }
        return amount;
    }

    /**
     * @dev Denormalize amount from 8 decimals to local decimals
     */
    function _denormalizeAmount(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        if (decimals > NORMALIZED_DECIMALS) {
            return amount * (10 ** (decimals - NORMALIZED_DECIMALS));
        } else if (decimals < NORMALIZED_DECIMALS) {
            return amount / (10 ** (NORMALIZED_DECIMALS - decimals));
        }
        return amount;
    }

    /**
     * @dev Convert address to bytes32
     */
    function _addressToBytes32(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }

    /**
     * @dev Convert bytes32 to address
     */
    function _bytes32ToAddress(bytes32 b) internal pure returns (address) {
        return address(uint160(uint256(b)));
    }

    /**
     * @dev Allow contract to receive ETH for Wormhole fees
     */
    receive() external payable {}
}
