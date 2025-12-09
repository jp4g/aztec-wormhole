// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.20;

import {IWormhole} from "wormhole/ethereum/contracts/interfaces/IWormhole.sol";
import {TokenBridgeState, TokenBridgeStorage} from "./TokenBridgeState.sol";

/**
 * @title TokenBridgeGetters
 * @dev View functions for the TokenBridge contract
 */
contract TokenBridgeGetters is TokenBridgeState {
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
    ) TokenBridgeState(wormholeAddr_, chainId_, evmChainId_, finality_) {}

    /**
     * @dev Returns the Wormhole contract interface
     */
    function wormhole() public view returns (IWormhole) {
        return IWormhole(_state.wormholeAddr);
    }

    /**
     * @dev Returns the Wormhole chain ID for this bridge
     */
    function chainId() public view returns (uint16) {
        return _state.provider.chainId;
    }

    /**
     * @dev Returns the native EVM chain ID
     */
    function evmChainId() public view returns (uint256) {
        return _state.evmChainId;
    }

    /**
     * @dev Returns the finality/consistency level for outbound messages
     */
    function finality() public view returns (uint8) {
        return _state.provider.finality;
    }

    /**
     * @dev Checks if running on a different chain than intended (fork detection)
     * @return True if this is a fork (chain ID mismatch)
     */
    function isFork() public view returns (bool) {
        return evmChainId() != block.chainid;
    }

    /**
     * @dev Gets the registered emitter for a remote chain
     * @param remoteChainId Wormhole chain ID of the remote chain
     * @return The registered emitter address as bytes32
     */
    function getRegisteredEmitter(uint16 remoteChainId) public view returns (bytes32) {
        return _state.registeredEmitters[remoteChainId];
    }

    /**
     * @dev Gets the token configuration for a local token
     * @param token Local token address
     * @return config The token configuration
     */
    function getTokenConfig(address token) public view returns (TokenBridgeStorage.TokenConfig memory config) {
        return _state.tokenConfigs[token];
    }

    /**
     * @dev Checks if a token is enabled for bridging
     * @param token Local token address
     * @return True if the token is enabled
     */
    function isTokenEnabled(address token) public view returns (bool) {
        return _state.tokenConfigs[token].enabled;
    }

    /**
     * @dev Gets the remote token info for a local token on a specific chain
     * @param localToken Local token address
     * @param remoteChainId Wormhole chain ID of the remote chain
     * @return info The remote token information
     */
    function getRemoteToken(
        address localToken,
        uint16 remoteChainId
    ) public view returns (TokenBridgeStorage.RemoteTokenInfo memory info) {
        return _state.remoteTokens[localToken][remoteChainId];
    }

    /**
     * @dev Checks if a VAA has already been processed
     * @param vaaHash Hash of the VAA
     * @return True if already processed
     */
    function isVaaProcessed(bytes32 vaaHash) public view returns (bool) {
        return _state.processedVaas[vaaHash];
    }

    /**
     * @dev Gets the current outbound nonce
     */
    function getOutboundNonce() public view returns (uint32) {
        return _state.outboundNonce;
    }

    /**
     * @dev Gets the Wormhole message fee
     */
    function getMessageFee() public view returns (uint256) {
        return wormhole().messageFee();
    }
}
