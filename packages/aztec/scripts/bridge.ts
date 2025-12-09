#!/usr/bin/env bun
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { isTestnet } from "../ts/src/utils";
import { getAccounts, getAddressesFromFs } from "./utils";
import { getTokenBridgeContract, getTokenContract } from "../ts/src/contract/deploy";
import { bridgeOutPublic, getBridgeConfig, getTokenConfig } from "../ts/src/contract/bridge";
import { getTestnetSendWaitOptions } from "./utils/gas";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { PXEConfig } from "@aztec/pxe/config";

// get environment variables
const { L2_NODE_URL, RECIPIENT, AMOUNT } = process.env;

if (!L2_NODE_URL) {
    throw new Error("L2_NODE_URL is not defined");
}

if (!RECIPIENT) {
    throw new Error("RECIPIENT is not defined. Set it to the EVM recipient address (0x...)");
}

const ARBITRUM_SEPOLIA_WORMHOLE_CHAIN_ID = 10003;

async function main() {
    const contractAddresses = await getAddressesFromFs();
    const node = await createAztecNodeClient(L2_NODE_URL!);

    // setup wallet and get accounts
    const testnet = await isTestnet(node);
    let pxeConfig: Partial<PXEConfig> = {};
    if (testnet) {
        pxeConfig = { rollupVersion: 1667575857, proverEnabled: false };
    }

    const { wallet, addresses } = await getAccounts(node, pxeConfig);
    const adminAddress = addresses[0];

    if (!adminAddress) {
        throw new Error("No accounts found. Run 'bun run setup:accounts' first.");
    }

    console.log("Using account:", adminAddress.toString());
    const opts = await getTestnetSendWaitOptions(node, wallet, adminAddress);

    // Get chain ID and load addresses
    const chainId = await node.getNodeInfo().then(info => info.l1ChainId.toString());
    const chainAddresses = contractAddresses[chainId];

    if (!chainAddresses?.bridge) {
        throw new Error(`No bridge address found for chain ${chainId}. Run 'bun run setup:deploy' first.`);
    }

    const bridgeAddress = AztecAddress.fromString(chainAddresses.bridge);
    const tokenAddress = AztecAddress.fromString(chainAddresses.token);

    console.log("Loading contracts...");
    const bridge = await getTokenBridgeContract(wallet, adminAddress, node, bridgeAddress);
    const token = await getTokenContract(wallet, adminAddress, node, tokenAddress);

    // Parse amount (default to 1 token with 18 decimals)
    const amount = AMOUNT ? BigInt(AMOUNT) : 1000000000000000000n;

    console.log("\nBridge configuration:");
    console.log("  Bridge:", bridgeAddress.toString());
    console.log("  Token:", tokenAddress.toString());
    console.log("  Amount:", amount.toString());
    console.log("  Recipient:", RECIPIENT);
    console.log("  Destination Chain:", ARBITRUM_SEPOLIA_WORMHOLE_CHAIN_ID);

    // Bridge out publicly
    console.log("\nBridging tokens out...");
    const receipt = await bridgeOutPublic(
        wallet,
        adminAddress,
        bridge,
        token,
        tokenAddress,
        amount,
        ARBITRUM_SEPOLIA_WORMHOLE_CHAIN_ID,
        RECIPIENT,
        opts
    );

    console.log("\nBridge transaction complete!");
    console.log("  Tx hash:", receipt.txHash.toString());
    console.log("  Block:", receipt.blockNumber);
}

if (import.meta.main) {
    main();
}
