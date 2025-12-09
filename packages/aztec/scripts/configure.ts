#!/usr/bin/env bun
import { dirname, join } from "path";
import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { config as dotenvConfig } from "dotenv";
import { createAztecNodeClient } from "@aztec/aztec.js/node";

// Load root .env file
dotenvConfig({ path: join(dirname(import.meta.path), "../../../.env") });
import { isTestnet } from "../ts/src/utils";
import { getAccounts, getAddressesFromFs } from "./utils";
import { getTokenBridgeContract } from "../ts/src/contract/deploy";
import { setRemoteToken, registerEmitter } from "../ts/src/contract/bridge";
import { getTestnetSendWaitOptions } from "./utils/gas";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { evmAddressToBytes32 } from "../ts/src/wormhole";
import type { PXEConfig } from "@aztec/pxe/config";

// Try to load EVM bridge address from forge broadcast
const BROADCAST_PATH = join(dirname(import.meta.path), "../../evm/broadcast/DeployTokenBridge.s.sol/421614/run-latest.json");

function getEvmBridgeFromBroadcast(): string | null {
    if (!existsSync(BROADCAST_PATH)) {
        return null;
    }
    try {
        const data = JSON.parse(readFileSync(BROADCAST_PATH, "utf-8"));
        // Find the CREATE transaction for TokenBridge
        const createTx = data.transactions?.find(
            (tx: any) => tx.transactionType === "CREATE" && tx.contractName === "TokenBridge"
        );
        return createTx?.contractAddress || null;
    } catch {
        return null;
    }
}

// Helper to update root .env file
function updateRootEnv(updates: Record<string, string>) {
    const rootEnvPath = join(dirname(import.meta.path), "../../../.env");
    let envContent = "";

    if (existsSync(rootEnvPath)) {
        envContent = readFileSync(rootEnvPath, "utf-8");
    }

    for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, "m");
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
            envContent += `\n${key}=${value}`;
        }
    }

    Bun.write(rootEnvPath, envContent.trim() + "\n");
    console.log("Updated root .env with EVM bridge address");
}

// get environment variables
const { L2_NODE_URL, EVM_TOKEN_ADDRESS, PRIVATE_KEY, ARBITRUM_RPC_URL } = process.env;
let { EVM_BRIDGE_ADDRESS } = process.env;

// Wormhole chain IDs
const AZTEC_WORMHOLE_CHAIN_ID = 56;
const ARBITRUM_SEPOLIA_WORMHOLE_CHAIN_ID = 10003;

if (!L2_NODE_URL) {
    throw new Error("L2_NODE_URL is not defined");
}

// Try to get EVM bridge from broadcast if not provided
if (!EVM_BRIDGE_ADDRESS) {
    const fromBroadcast = getEvmBridgeFromBroadcast();
    if (fromBroadcast) {
        EVM_BRIDGE_ADDRESS = fromBroadcast;
        console.log("Found EVM bridge address from forge broadcast:", EVM_BRIDGE_ADDRESS);
    } else {
        throw new Error("EVM_BRIDGE_ADDRESS is not defined and couldn't find forge broadcast. Set it manually or run forge deploy first.");
    }
}

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

    console.log("Using admin account:", adminAddress.toString());
    const opts = await getTestnetSendWaitOptions(node, wallet, adminAddress);

    // Get chain ID and load addresses
    const chainId = await node.getNodeInfo().then(info => info.l1ChainId.toString());
    const chainAddresses = contractAddresses[chainId];

    if (!chainAddresses?.bridge) {
        throw new Error(`No bridge address found for chain ${chainId}. Run 'bun run setup:deploy' first.`);
    }

    const bridgeAddress = AztecAddress.fromString(chainAddresses.bridge);
    const tokenAddress = AztecAddress.fromString(chainAddresses.token);

    console.log("Loading TokenBridge at:", bridgeAddress.toString());
    const bridgeContract = await getTokenBridgeContract(wallet, adminAddress, node, bridgeAddress);

    // Register EVM bridge as emitter
    console.log("Registering EVM bridge emitter...");
    console.log("  Chain ID:", ARBITRUM_SEPOLIA_WORMHOLE_CHAIN_ID);
    console.log("  Emitter:", EVM_BRIDGE_ADDRESS);

    const evmBridgeBytes = evmAddressToBytes32(EVM_BRIDGE_ADDRESS);
    await registerEmitter(
        wallet,
        adminAddress,
        bridgeContract,
        ARBITRUM_SEPOLIA_WORMHOLE_CHAIN_ID,
        evmBridgeBytes,
        opts
    );
    console.log("EVM emitter registered!");

    // Set remote token mapping if EVM token address provided
    if (EVM_TOKEN_ADDRESS) {
        console.log("Setting remote token mapping...");
        console.log("  Local token:", tokenAddress.toString());
        console.log("  Remote token:", EVM_TOKEN_ADDRESS);

        const evmTokenBytes = evmAddressToBytes32(EVM_TOKEN_ADDRESS);
        await setRemoteToken(
            wallet,
            adminAddress,
            bridgeContract,
            tokenAddress,
            ARBITRUM_SEPOLIA_WORMHOLE_CHAIN_ID,
            evmTokenBytes,
            true,
            opts
        );
        console.log("Remote token mapping set!");
    } else {
        console.log("Skipping remote token mapping (EVM_TOKEN_ADDRESS not set)");
    }

    // Update root .env with EVM bridge address
    updateRootEnv({
        EVM_BRIDGE_ADDRESS: EVM_BRIDGE_ADDRESS!,
    });

    // =========================================================================
    // EVM SIDE: Register Aztec bridge as emitter on EVM TokenBridge
    // =========================================================================
    console.log("\n--- Configuring EVM Side ---");

    if (!PRIVATE_KEY) {
        console.log("Skipping EVM configuration (PRIVATE_KEY not set)");
    } else {
        const rpcUrl = ARBITRUM_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";

        // Pad Aztec bridge address to bytes32 (left-pad with zeros)
        const aztecBridgeBytes32 = bridgeAddress.toString().replace("0x", "").padStart(64, "0");

        console.log("Registering Aztec bridge emitter on EVM...");
        console.log("  EVM Bridge:", EVM_BRIDGE_ADDRESS);
        console.log("  Aztec Chain ID:", AZTEC_WORMHOLE_CHAIN_ID);
        console.log("  Aztec Emitter:", `0x${aztecBridgeBytes32}`);

        try {
            const castCmd = `cast send ${EVM_BRIDGE_ADDRESS} "registerEmitter(uint16,bytes32)" ${AZTEC_WORMHOLE_CHAIN_ID} 0x${aztecBridgeBytes32} --rpc-url ${rpcUrl} --private-key ${PRIVATE_KEY}`;
            execSync(castCmd, { stdio: "inherit" });
            console.log("Aztec emitter registered on EVM!");
        } catch (e) {
            console.error("Failed to register Aztec emitter on EVM:", e);
            throw e;
        }
    }

    console.log("\nConfiguration complete!");
}

if (import.meta.main) {
    main();
}
