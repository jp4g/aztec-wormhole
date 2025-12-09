#!/usr/bin/env bun
import { dirname, join } from "path";
import { existsSync, readFileSync } from "fs";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { isTestnet } from "../ts/src/utils";
import { ContractAddressData, getAccounts, getAddressesFromFs } from "./utils";
import {
    deployTokenContract,
    deployWormholeContract,
    deployTokenBridgeContract,
} from "../ts/src/contract/deploy";
import { setTokenConfig, setRemoteToken, registerEmitter } from "../ts/src/contract/bridge";
import { getTestnetSendWaitOptions } from "./utils/gas";
import { TOKEN_METADATA } from "../ts/src/constants";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { hexAddressToUint8Array } from "../ts/src/wormhole";
import type { PXEConfig } from "@aztec/pxe/config";

// Helper to update root .env file with deployed addresses
function updateRootEnv(updates: Record<string, string>) {
    const rootEnvPath = join(dirname(import.meta.path), "../../../.env");
    let envContent = "";

    if (existsSync(rootEnvPath)) {
        envContent = readFileSync(rootEnvPath, "utf-8");
    }

    for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, "m");
        if (regex.test(envContent)) {
            // Update existing key
            envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
            // Add new key
            envContent += `\n${key}=${value}`;
        }
    }

    Bun.write(rootEnvPath, envContent.trim() + "\n");
    console.log("Updated root .env with deployed addresses");
}

// get environment variables
const { L2_NODE_URL } = process.env;

if (!L2_NODE_URL) {
    throw new Error("L2_NODE_URL is not defined");
}

// Chain IDs
const AZTEC_WORMHOLE_CHAIN_ID = 56n;
const ARBITRUM_SEPOLIA_WORMHOLE_CHAIN_ID = 10003;

async function main() {
    const contractAddresses = await getAddressesFromFs();
    const node = await createAztecNodeClient(L2_NODE_URL!);

    // setup wallet and get accounts (handles testnet vs sandbox)
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

    // setup token and wormhole
    let tokenAddress;
    let wormholeAddress;
    if (testnet) {
        tokenAddress = AztecAddress.fromString(contractAddresses["11155111"].token);
        wormholeAddress = AztecAddress.fromString(contractAddresses["11155111"].wormhole);
        console.log("Using existing token:", tokenAddress.toString());
        console.log("Using existing wormhole:", wormholeAddress.toString());
    } else {
        try {
            console.log("Deploying Token contract...");
            const tokenContract = await deployTokenContract(
                wallet,
                adminAddress,
                TOKEN_METADATA,
                opts
            );
            tokenAddress = tokenContract.address;
            console.log("Token deployed at:", tokenAddress.toString());
        } catch (e) {
            console.error(e);
            throw new Error("Failed to deploy token contract");
        }
        try {
            console.log("Deploying Wormhole contract...");
            const chainIds = { wormhole: Number(AZTEC_WORMHOLE_CHAIN_ID), evm: 1 };
            const wormholeContract = await deployWormholeContract(
                wallet,
                adminAddress,
                chainIds,
                adminAddress,
                tokenAddress,
                opts
            );
            wormholeAddress = wormholeContract.address;
            console.log("Wormhole deployed at:", wormholeAddress.toString());
        } catch (e) {
            console.error(e);
            throw new Error("Failed to deploy wormhole contract");
        }
    }

    // deploy TokenBridge
    let bridgeAddress;
    let bridgeContract;
    try {
        console.log("Deploying TokenBridge contract...");
        bridgeContract = await deployTokenBridgeContract(
            wallet,
            adminAddress,
            wormholeAddress,
            AZTEC_WORMHOLE_CHAIN_ID,
            0n,  // message fee
            opts
        );
        bridgeAddress = bridgeContract.address;
        console.log("TokenBridge deployed at:", bridgeAddress.toString());
    } catch (e) {
        console.error(e);
        throw new Error("Failed to deploy TokenBridge contract");
    }

    // Configure the bridge for the deployed token
    try {
        console.log("Configuring token for bridging...");

        // Set token config (enabled, native=true for Aztec-native tokens, 18 decimals)
        await setTokenConfig(
            wallet,
            adminAddress,
            bridgeContract,
            tokenAddress,
            true,   // enabled
            true,   // is_native (lock/unlock on this side)
            TOKEN_METADATA.decimals,
            opts
        );
        console.log("Token config set");

    } catch (e) {
        console.error(e);
        throw new Error("Failed to configure bridge");
    }

    // save to fs
    try {
        const chainId = await node.getNodeInfo().then(info => info.l1ChainId.toString());
        const scriptDir = dirname(import.meta.path);
        const addressesFilePath = join(scriptDir, "./data/addresses.json");

        const contractAddressData: ContractAddressData = {
            token: tokenAddress.toString(),
            wormhole: wormholeAddress.toString(),
            bridge: bridgeAddress.toString(),
            receiver: adminAddress.toString()
        }

        contractAddresses[chainId] = contractAddressData;

        await Bun.write(addressesFilePath, JSON.stringify(contractAddresses, null, 2));
        console.log("Deployed addresses saved to:", addressesFilePath);

        // Also update root .env for relayer and other services
        updateRootEnv({
            WORMHOLE_CONTRACT: wormholeAddress.toString(),
            TOKEN_CONTRACT: tokenAddress.toString(),
            AZTEC_BRIDGE_ADDRESS: bridgeAddress.toString(),
            AZTEC_EMITTER_ADDRESS: bridgeAddress.toString(),  // Bridge emits Wormhole messages
            AZTEC_RECEIVER_ADDRESS: adminAddress.toString(),
        });
    } catch (e) {
        console.error(e);
        throw new Error("Failed to save deployment addresses")
    }
}

if (import.meta.main) {
    main();
}
