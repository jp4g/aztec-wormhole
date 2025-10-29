#!/usr/bin/env bun
import { createPXEClient, PXE, waitForPXE } from "@aztec/aztec.js";
import { getInitialTestAccountsWallets } from "@aztec/accounts/testing"

import { deployToken, deployEmitterContract, deployWormholeContract } from "../src/contract";
import { dirname, join } from "path";
import { execCommand, copyFileWithLog, replaceInFile } from "./utils";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";

// warning: not set up to work on testnet
const { PXE_URL = 'http://localhost:8080' } = process.env;
async function main() {
    try {
        // Connect to PXE
        const pxe = await createPXEClient(PXE_URL);
        await waitForPXE(pxe);
        console.log("Connected to PXE at", PXE_URL);
        const evmChainId = (await pxe.getNodeInfo()).l1ChainId;

        // Get test wallets
        const [deployer] = await getInitialTestAccountsWallets(pxe);
        console.log("dddd", deployer.getAddress());
        // Deploy the token contract
        const tokenContract = await deployToken(deployer);
        console.log("e")
        // Deploy the wormhole contract
        const wormholeContract = await deployWormholeContract(
            deployer,
            // hardcoded chain ids
            { wormhole: 1, evm: evmChainId },
            tokenContract.address
        );

        // Deploy the emitter contract
        const emitterContract = await deployEmitterContract(
            deployer,
            tokenContract.address,
            wormholeContract.address
        );

        // log deployed addresses
        console.log("Deployed Token Contract at:", tokenContract.address.toString());
        console.log("Deployed Wormhole Contract at:", wormholeContract.address.toString());
        console.log("Deployed Emitter Contract at:", emitterContract.address.toString());

        // save the deployed addresses to a file
        const scriptDir = dirname(import.meta.path);
        const deployementsDir = join(scriptDir, "../deployments", evmChainId.toString());
        // check if deployments dir exists
        if (!existsSync(deployementsDir)) {
            await mkdir(deployementsDir, { recursive: true });
        }
        const addressesFilePath = join(deployementsDir, "addresses.json");
        const deployedAddresses = {
            tokenContract: tokenContract.address.toString(),
            wormholeContract: wormholeContract.address.toString(),
            emitterContract: emitterContract.address.toString(),
        };
        await Bun.write(addressesFilePath, JSON.stringify(deployedAddresses, null, 2));
        console.log("Deployed addresses saved to:", addressesFilePath);
    } catch (error) {
        console.error("Compilation failed:", error);
        process.exit(1);
    }
}

if (import.meta.main) {
    main();
}