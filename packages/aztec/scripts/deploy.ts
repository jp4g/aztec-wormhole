#!/usr/bin/env bun
import { createPXEClient, PXE, waitForPXE } from "@aztec/aztec.js";

// import { deployToken, deployEmitterContract, deployWormholeContract } from "../src/contract";
import { dirname, join } from "path";
import { execCommand, copyFileWithLog, replaceInFile } from "./utils/cmd";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { isTestnet } from "../ts/src/utils";
import { ContractAddressData, getAccountsFromFs, getAddressesFromFs } from "./utils";
import { TestWallet } from "@aztec/test-wallet/server";
import type { PXEConfig } from "@aztec/pxe/config";
import {
    deployTokenContract,
    deployWormholeContract,
    deployWormholeEmitterContract,
    getTokenContract,
    getWormholeContract
} from "../ts/src/contract";
import { getTestnetSendWaitOptions } from "./utils/gas";
import { TOKEN_METADATA } from "../ts/src/constants";
import { AztecAddress } from "@aztec/stdlib/aztec-address";

// warning: not set up to work on testnet
// get environment variables
const { L2_NODE_URL } = process.env;

if (!L2_NODE_URL) {
    throw new Error("L2_NODE_URL is not defined");
}

async function main() {
    const contractAddresses = await getAddressesFromFs();
    const node = await createAztecNodeClient(L2_NODE_URL!);

    // setup wallet
    const testnet = await isTestnet(node);
    let pxeConfig: Partial<PXEConfig> = {};
    if (await isTestnet(node))
        pxeConfig = { rollupVersion: 1667575857, proverEnabled: false };
    const wallet = await TestWallet.create(node, pxeConfig);
    const addresses = await getAccountsFromFs(wallet);
    const opts = await getTestnetSendWaitOptions(node, wallet, addresses[0]);

    // setup token and wormhole
    let tokenAddress;
    let wormholeAddress;
    if (testnet) {
        tokenAddress = AztecAddress.fromString(contractAddresses["11155111"].token);
        // await getTokenContract(wallet, addresses[0], node, tokenAddress);
        wormholeAddress = AztecAddress.fromString(contractAddresses["11155111"].wormhole);
        // await getWormholeContract(wallet, addresses[0], node, wormholeAddress);
    } else {
        try {
            const tokenContract = await deployTokenContract(
                wallet,
                addresses[0],
                TOKEN_METADATA,
                opts
            );
            tokenAddress = tokenContract.address;
        } catch (e) {
            console.error(e);
            throw new Error("Failed to deploy token contract");
        }
        try {
            const chainIds = { wormhole: 1, evm: 1 };
            const wormholeContract = await deployWormholeContract(
                wallet,
                addresses[0],
                chainIds,
                addresses[0],
                tokenAddress,
                opts
            );
            wormholeAddress = wormholeContract.address;
        } catch (e) {
            console.error(e);
            throw new Error("Failed to deploy wormhole contract");
        }
    }

    // deploy emitter
    let emitterAddress;
    try {
        const emitterContract = await deployWormholeEmitterContract(
            wallet,
            addresses[0],
            tokenAddress,
            wormholeAddress,
            addresses[0],
            opts
        );
        emitterAddress = emitterContract.address;
    } catch (e) {
        console.error(e);
        throw new Error("Failed to deploy emitter contract");
    }

    // save to fs
    try {
        const chainId = await node.getNodeInfo().then(info => info.l1ChainId.toString());
        const scriptDir = dirname(import.meta.path);
        const addressesFilePath = join(scriptDir, "../data/addresses.json", chainId);

        const contractAddressData: ContractAddressData = {
            token: tokenAddress.toString(),
            wormhole: wormholeAddress.toString(),
            emitter: emitterAddress.toString(),
            receiver: addresses[0].toString()
        }

        contractAddresses[chainId] = contractAddressData;

        await Bun.write(addressesFilePath, JSON.stringify(contractAddresses, null, 2));
        console.log("Deployed addresses saved to:", addressesFilePath);
    } catch (e) {
        console.error(e);
        throw new Error("Failed to save deployment addresses")
    }
}

if (import.meta.main) {
    main();
}