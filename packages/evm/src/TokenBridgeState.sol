// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.20;

/**
 * @title TokenBridgeStorage
 * @dev Storage structures for the TokenBridge contract
 */
contract TokenBridgeStorage {
    /**
     * @dev Configuration for a bridgeable token
     */
    struct TokenConfig {
        bool enabled;           // Whether this token can be bridged
        bool isNative;          // True if this is a native token (lock/unlock), false if bridged (mint/burn)
        uint8 decimals;         // Token decimals for normalization
    }

    /**
     * @dev Remote token mapping for cross-chain transfers
     */
    struct RemoteTokenInfo {
        bytes32 remoteToken;    // Token address on remote chain (as bytes32)
        bool enabled;           // Whether bridging to this remote is enabled
    }

    /**
     * @dev Provider configuration
     */
    struct Provider {
        uint16 chainId;         // Wormhole chain ID
        uint8 finality;         // Consistency level for outbound messages
    }

    /**
     * @dev Main state structure
     */
    struct State {
        // Wormhole contract address
        address wormholeAddr;

        // Provider configuration
        Provider provider;

        // Native EVM chain ID (for fork detection)
        uint256 evmChainId;

        // Registered emitters: remoteChainId => emitterAddress
        mapping(uint16 => bytes32) registeredEmitters;

        // Token configurations: localToken => config
        mapping(address => TokenConfig) tokenConfigs;

        // Remote token mappings: localToken => remoteChainId => remoteTokenInfo
        mapping(address => mapping(uint16 => RemoteTokenInfo)) remoteTokens;

        // Processed VAAs for replay protection: vaaHash => processed
        mapping(bytes32 => bool) processedVaas;

        // Nonce for outbound messages
        uint32 outboundNonce;

        // Test message storage - last received value from cross-chain
        uint256 lastReceivedValue;
        uint16 lastReceivedFromChain;
        bytes32 lastReceivedSender;
    }
}

/**
 * @title TokenBridgeState
 * @dev State management and ownership for the TokenBridge
 */
contract TokenBridgeState is TokenBridgeStorage {
    State internal _state;
    address private immutable _OWNER;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @param wormholeAddr_ Address of the Wormhole core contract
     * @param chainId_ Wormhole chain ID for this bridge
     * @param evmChainId_ Native EVM chain ID (for fork detection)
     * @param finality_ Consistency level for outbound messages
     */
    constructor(
        address wormholeAddr_,
        uint16 chainId_,
        uint256 evmChainId_,
        uint8 finality_
    ) {
        require(wormholeAddr_ != address(0), "Wormhole address cannot be zero");
        require(finality_ > 0, "Finality must be greater than zero");

        _state.wormholeAddr = wormholeAddr_;
        _state.provider.chainId = chainId_;
        _state.evmChainId = evmChainId_;
        _state.provider.finality = finality_;
        _state.outboundNonce = 0;

        _OWNER = msg.sender;
    }

    /**
     * @dev Returns the owner of the contract
     */
    function owner() public view returns (address) {
        return _OWNER;
    }

    /**
     * @dev Modifier that restricts functions to the owner
     */
    modifier onlyOwner() {
        require(msg.sender == _OWNER, "Caller is not the owner");
        _;
    }
}
