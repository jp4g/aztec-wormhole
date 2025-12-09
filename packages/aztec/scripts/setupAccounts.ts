import "dotenv/config";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { getTestnetSendWaitOptions } from "./utils/gas";
import { isTestnet } from "../ts/src/utils";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import type { PXEConfig } from "@aztec/pxe/config";
import { Fr } from "@aztec/aztec.js/fields";

// get environment variables
const { L2_NODE_URL } = process.env;

if (!L2_NODE_URL) {
    throw new Error("L2_NODE_URL is not defined");
}

type AccountData = {
    secretKey: string;
    salt: string;
}

const accountFilePath = `${__dirname}/data/accounts.json`;

const loadExistingAccounts = (): AccountData[] | null => {
    if (!existsSync(accountFilePath)) {
        return null;
    }
    try {
        const data = readFileSync(accountFilePath, "utf-8");
        const accounts = JSON.parse(data) as AccountData[];
        if (accounts.length > 0 && accounts[0].secretKey && accounts[0].salt) {
            return accounts;
        }
        return null;
    } catch {
        return null;
    }
}

const main = async () => {
    const node = createAztecNodeClient(L2_NODE_URL);
    const testnet = await isTestnet(node);

    let pxeConfig: Partial<PXEConfig> = {};
    if (testnet) {
        pxeConfig = { rollupVersion: 1667575857, proverEnabled: false };
    }

    const wallet = await TestWallet.create(node, pxeConfig);

    // On testnet, check if we already have accounts saved
    if (testnet) {
        const existingAccounts = loadExistingAccounts();
        if (existingAccounts && existingAccounts.length > 0) {
            console.log("Found existing accounts in accounts.json, loading...");

            const addresses: AztecAddress[] = [];
            for (const account of existingAccounts) {
                const secretKey = Fr.fromString(account.secretKey);
                const salt = Fr.fromString(account.salt);
                const manager = await wallet.createSchnorrAccount(secretKey, salt);
                addresses.push(manager.address);
                console.log(`  Loaded account: ${manager.address.toString()}`);
            }

            // Verify at least one account is deployed by checking if it exists
            const firstAddress = addresses[0];
            const isDeployed = await node.getContract(firstAddress).catch(() => null);

            if (isDeployed) {
                console.log("Accounts already deployed on chain. Skipping deployment.");
                console.log(`Account Setup complete! (${addresses.length} accounts loaded)`);
                return;
            } else {
                console.log("Accounts exist in file but not deployed. Deploying...");
                for (let i = 0; i < existingAccounts.length; i++) {
                    const secretKey = Fr.fromString(existingAccounts[i].secretKey);
                    const salt = Fr.fromString(existingAccounts[i].salt);
                    const manager = await wallet.createSchnorrAccount(secretKey, salt);
                    const opts = await getTestnetSendWaitOptions(node, wallet, AztecAddress.ZERO);
                    console.log(`  Deploying account ${i + 1}/${existingAccounts.length}...`);
                    await manager.getDeployMethod()
                        .then(deployMethod => deployMethod.send(opts.send).wait(opts.wait));
                    console.log(`  Deployed: ${manager.address.toString()}`);
                }
                console.log(`Account Setup complete! (${existingAccounts.length} accounts deployed)`);
                return;
            }
        }
    }

    // Sandbox: use pre-funded test accounts
    // Testnet with no existing accounts: create new ones
    if (!testnet) {
        console.log("Loading pre-funded sandbox test accounts...");
        const testAccounts = await getInitialTestAccountsData();
        const accountData: AccountData[] = [];

        for (let i = 0; i < testAccounts.length; i++) {
            const account = testAccounts[i];
            await wallet.createSchnorrAccount(account.secret, account.salt);
            console.log(`  Loaded: ${account.address.toString()}`);
            accountData.push({
                secretKey: account.secret.toString(),
                salt: account.salt.toString(),
            });
        }

        writeFileSync(accountFilePath, JSON.stringify(accountData, null, 2));
        console.log(`Wrote accounts to ${accountFilePath}`);
        console.log(`Account Setup complete! (${testAccounts.length} pre-funded accounts loaded)`);
        return;
    }

    // Testnet: create new accounts
    console.log("Creating new testnet accounts...");
    const accountData: AccountData[] = [];
    const numAccounts = 3;

    for (let i = 0; i < numAccounts; i++) {
        const secret = Fr.random();
        const salt = Fr.random();
        const manager = await wallet.createSchnorrAccount(secret, salt);
        const opts = await getTestnetSendWaitOptions(node, wallet, AztecAddress.ZERO);

        console.log(`  Deploying account ${i + 1}/${numAccounts}...`);
        await manager.getDeployMethod()
            .then(deployMethod => deployMethod.send(opts.send).wait(opts.wait));
        console.log(`  Deployed: ${manager.address.toString()}`);

        accountData.push({
            secretKey: secret.toString(),
            salt: salt.toString(),
        });
    }

    // Save accounts to file
    writeFileSync(accountFilePath, JSON.stringify(accountData, null, 2));
    console.log(`Wrote accounts to ${accountFilePath}`);
    console.log(`Account Setup complete! (${numAccounts} accounts created)`);
}

main();