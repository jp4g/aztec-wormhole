// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.20;

import {TokenBridge} from "../src/TokenBridge.sol";
import {BridgedToken} from "../src/BridgedToken.sol";
import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

/**
 * @title DeployTokenBridge
 * @dev Deployment script for the generalized TokenBridge
 *
 * Usage:
 *   # Local deployment (Anvil)
 *   forge script script/DeployTokenBridge.s.sol --fork-url http://localhost:8545 --broadcast
 *
 *   # Arbitrum Sepolia testnet deployment
 *   forge script script/DeployTokenBridge.s.sol --fork-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast
 *
 * Required environment variables:
 *   PRIVATE_KEY - Deployer private key
 *
 * Optional environment variables:
 *   WORMHOLE_ADDRESS - Override Wormhole contract address
 *   WORMHOLE_CHAIN_ID - Override Wormhole chain ID
 *   FINALITY - Override finality/consistency level
 *   DEPLOY_TEST_TOKEN - Set to "true" to deploy a test BridgedToken
 *
 * NOTE: Emitter registration is done separately via configure scripts after deployment.
 */
contract DeployTokenBridge is Script {
    function run() external returns (address bridgeAddress, address testTokenAddress) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Get network configuration
        (
            address wormholeAddress,
            uint16 wormholeChainId,
            uint8 finality
        ) = _getNetworkConfig();

        bool deployTestToken = vm.envOr("DEPLOY_TEST_TOKEN", false);

        console.log("=== TokenBridge Deployment ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", deployer);
        console.log("Wormhole Address:", wormholeAddress);
        console.log("Wormhole Chain ID:", wormholeChainId);
        console.log("Finality:", finality);
        console.log("Deploy Test Token:", deployTestToken);
        console.log("==============================");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy TokenBridge
        TokenBridge bridge = new TokenBridge(
            payable(wormholeAddress),
            wormholeChainId,
            block.chainid,
            finality
        );
        bridgeAddress = address(bridge);
        console.log("TokenBridge deployed to:", bridgeAddress);

        // Optionally deploy a test token
        if (deployTestToken) {
            BridgedToken testToken = new BridgedToken(
                "Test Bridge Token",
                "TBT",
                18,
                deployer
            );
            testTokenAddress = address(testToken);
            console.log("Test BridgedToken deployed to:", testTokenAddress);

            // Grant minter role to bridge
            testToken.grantRole(testToken.MINTER_ROLE(), bridgeAddress);
            console.log("Granted MINTER_ROLE to bridge");

            // Configure token on bridge (as bridged/mintable token)
            bridge.setTokenConfig(testTokenAddress, true, false, 18);
            console.log("Configured test token on bridge");
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("TokenBridge:", bridgeAddress);
        if (deployTestToken) {
            console.log("Test Token:", testTokenAddress);
        }
        console.log("===========================");
    }

    /**
     * @dev Get network-specific configuration based on chain ID
     */
    function _getNetworkConfig() internal view returns (
        address wormholeAddress,
        uint16 wormholeChainId,
        uint8 finality
    ) {
        if (block.chainid == 31337) {
            // Local Anvil
            wormholeAddress = vm.envOr("WORMHOLE_ADDRESS", address(0xC89Ce4735882C9F0f0FE26686c53074E09B0D550));
            wormholeChainId = uint16(vm.envOr("WORMHOLE_CHAIN_ID", uint256(10003)));
            finality = uint8(vm.envOr("FINALITY", uint256(1)));
        } else if (block.chainid == 421614) {
            // Arbitrum Sepolia
            wormholeAddress = vm.envOr("WORMHOLE_ADDRESS", address(0x6b9C8671cdDC8dEab9c719bB87cBd3e782bA6a35));
            wormholeChainId = uint16(vm.envOr("WORMHOLE_CHAIN_ID", uint256(10003)));
            finality = uint8(vm.envOr("FINALITY", uint256(1)));
        } else {
            revert(string.concat("Unsupported chain ID: ", vm.toString(block.chainid)));
        }
    }
}
