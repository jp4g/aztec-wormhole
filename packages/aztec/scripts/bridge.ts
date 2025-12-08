#!/usr/bin/env bun

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
    deployWormholeBridgeContract,
    getWormholeBridgeContract,
    getTokenContract,
} from "../ts/src/contract/deploy";
import { getTestnetSendWaitOptions } from "./utils/gas";
import { TOKEN_METADATA } from "../ts/src/constants";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { WormholeBridgeContract } from "../ts/src/artifacts";
import { bridgeOutPrivate } from "../ts/src/contract/bridge";
import { EthAddress } from "@aztec/stdlib/block";

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
    // const testnet = await isTestnet(node);
    let pxeConfig: Partial<PXEConfig> = {};
    if (await isTestnet(node))
        pxeConfig = { rollupVersion: 1667575857, proverEnabled: false };
    const wallet = await TestWallet.create(node, pxeConfig);
    const addresses = await getAccountsFromFs(wallet);
    const opts = await getTestnetSendWaitOptions(node, wallet, addresses[0]);

    // get bridge contract
    const bridgeAddress = AztecAddress.fromString(contractAddresses["11155111"].bridge!);
    let bridge = await getWormholeBridgeContract(
        wallet,
        addresses[0],
        node,
        bridgeAddress
    );

    // get token contract
    let tokenAddress = AztecAddress.fromString(contractAddresses["11155111"].token!);
    let token = await getTokenContract(
        wallet,
        addresses[0],
        node,
        tokenAddress
    );

    // try to bridge out 0 tokens
    let receipt = await bridgeOutPrivate(
        false,
        wallet,
        addresses[0],
        bridge,
        token,
        0n,
        EthAddress.ZERO.toString(),
        undefined,
        opts
    );

    console.log("receipt:", receipt);
}

if (import.meta.main) {
    main();
}