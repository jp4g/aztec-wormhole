#!/usr/bin/env bun
import { createPXEClient, createAztecNodeClient, PXE, waitForPXE } from "@aztec/aztec.js";
import { getInitialTestAccountsWallets } from "@aztec/accounts/testing"
import { dirname, join } from "path";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { TokenContract, TokenContractArtifact } from "@aztec/noir-contracts.js/Token";

// warning: not set up to work on testnet
const { PXE_URL = 'http://localhost:8080' } = process.env;
async function main() {
    // try {
    //     // Connect to PXE
    //     const pxe = await createPXEClient(PXE_URL);
    //     const node = createAztecNodeClient(PXE_URL);
    //     await waitForPXE(pxe);
    //     console.log("Connected to PXE at", PXE_URL);

    //     // get accounts
    //     let [minter, alice, bob] = await getInitialTestAccountsWallets(pxe);

    //     // get token contract
    //     const scriptDir = dirname(import.meta.path);
    //     const deployementsDir = join(scriptDir, "../deployments", "31337");
    //     const addressesFilePath = join(deployementsDir, "addresses.json");
    //     if (!existsSync(addressesFilePath)) {
    //         throw new Error(`Deployed addresses file not found at path: ${addressesFilePath}`);
    //     }
    //     const deployedAddresses = JSON.parse(await readFile(addressesFilePath).then(x => x.toString()));
    //     console.log("Got addresses ", deployedAddresses);
    //     const tokenAddress = deployedAddresses.tokenContract;
    //     console.log("Using deployed token contract at:", tokenAddress);
    //     const tokenInstance = await node.getContract(tokenAddress);
    //     await pxe.registerContract({
    //         instance: tokenInstance!,
    //         artifact: TokenContractArtifact
    //     })
    //     const token = await TokenContract.at(tokenAddress, minter);
    //     // mint tokens to each of the three accounts
    //     await token.methods.mint_to_private(minter.getAddress(), 1000n)
    //         .send({from: minter.getAddress()})
    //         .wait();
    //     await token.methods.mint_to_private(alice.getAddress(), 1000n)
    //         .send({from: minter.getAddress()})
    //         .wait();
    //     await token.methods.mint_to_private(bob.getAddress(), 1000n)
    //         .send({from: minter.getAddress()})
    //         .wait();
    //     console.log("Minted 1000 tokens each to minter, alice, and bob");
    //     const minterBalance = await token.methods.balance_of_private(minter.getAddress()).simulate({from: minter.getAddress()});
    //     const aliceBalance = await token.methods.balance_of_private(alice.getAddress()).simulate({from: alice.getAddress()});
    //     const bobBalance = await token.methods.balance_of_private(bob.getAddress()).simulate({from: bob.getAddress()});
    //     console.log(`Minter balance: ${minterBalance}, Alice balance: ${aliceBalance}, Bob balance: ${bobBalance}`);
    // } catch (error) {
    //     console.error("Compilation failed:", error);
    //     process.exit(1);
    // }
}

if (import.meta.main) {
    main();
}