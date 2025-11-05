import "dotenv/config";
import { writeFileSync } from "fs";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";
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

// Fund 2 accounts
const main = async () => {
    // Create Node & PXE Config Options
    const node = createAztecNodeClient(L2_NODE_URL);
    let pxeConfig: Partial<PXEConfig> = {};
    if (await isTestnet(node)) 
        pxeConfig = { rollupVersion: 1667575857, proverEnabled: false };

    // deploy seller account
    const accountData = [];
    const wallet = await TestWallet.create(node, pxeConfig);
    for (let i = 0; i < 3; i++) {
        let secret = Fr.random();
        let salt = Fr.random();
        let manager = await wallet.createSchnorrAccount(secret, salt);
        let opts = await getTestnetSendWaitOptions(node, wallet, AztecAddress.ZERO);
        await manager.getDeployMethod()
            .then(deployMethod => deployMethod.send(opts.send).wait(opts.wait));
        accountData.push({
            secretKey: secret.toString(),
            salt: salt.toString(),
        });
    }
    
    // deploy buyer account
    const accountFilePath = `${__dirname}/data/accounts.json`;
    writeFileSync(accountFilePath, JSON.stringify(accountData, null, 2));
    console.log(`Wrote accounts to ${accountFilePath}`);

    console.log(`Account Setup complete!`);
}

main();