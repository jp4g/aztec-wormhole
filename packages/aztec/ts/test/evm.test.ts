// import { AccountWallet, PXE, Fr, AztecAddress, createPXEClient, AztecNode, createAztecNodeAdminClient } from "@aztec/aztec.js";
import { } from "@aztec/aztec.js/contracts"
import { generateSchnorrAccounts, getInitialTestAccountsData } from "@aztec/accounts/testing";
import { TokenContract } from "@aztec/noir-contracts.js/Token"
import { WormholeContract, WormholeEmitterContract } from "../src/artifacts";
import { TOKEN_METADATA, FIXED_WORMHOLE_FEE } from "../src/constants";
import { deployTokenContract, deployWormholeContract, deployWormholeEmitterContract, privateTransferAuthwit } from "../src/contract";
import { wad } from "../src/utils";
import type { SequencerClient } from '@aztec/sequencer-client';
import { createMessageArrays } from "../src/wormhole/utils";
import { CheatCodes } from "@aztec/aztec/testing";

// import { UserFeeOptions } from '@aztec/entrypoints/interfaces';
import { GasSettings } from '@aztec/stdlib/gas';
import { createAztecNodeAdminClient, type AztecNodeAdmin } from "@aztec/stdlib/interfaces/client";
import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";
import { sleep } from "bun";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TestDateProvider } from "@aztec/foundation/timer"


const {
    L1_RPC_URL = "http://localhost:8545",
    L2_NODE_URL = "http://localhost:8080",
} = process.env;

describe("EVM Wormhole Crosschain Test", () => {


    let node: AztecNode;
    let cc: CheatCodes;
    let wallet: TestWallet;
    let addresses: AztecAddress[];

    let token: TokenContract;
    let wormhole: WormholeContract;
    let emitter: WormholeEmitterContract;

    beforeAll(async () => {
        // set up clients
        node = createAztecNodeClient(L2_NODE_URL);
        cc = await CheatCodes.create([L1_RPC_URL], node, new TestDateProvider());

        // setup wallet
        const accounts = await getInitialTestAccountsData();
        wallet = await TestWallet.create(node);
        addresses = await Promise.all(accounts.map(async account => {
            await wallet.createSchnorrAccount(account.secret, account.salt);
            return account.address;
        }));

        // set up token
        token = await deployTokenContract(wallet, addresses[0]);

        // setup wormhole
        wormhole = await deployWormholeContract(
            wallet,
            addresses[0],
            { wormhole: 57, evm: 57 },
            token.address
        );

        // set up emitter
        emitter = await deployWormholeEmitterContract(
            wallet,
            addresses[0],
            token.address,
            wormhole.address
        );

        // we need to advance time by 87000 seconds (~24 hours) for wormhole
        // delayed mutable to take effect. But we cannot advance 24 hours at once
        // so we will mint, advance ~12 hours, mint, advance 12 hours, mint
        // this will mine a tx within expiry date to advance while minting tokens

        // mint tokens to account 1
        await token.methods.mint_to_private(
            addresses[0],
            wad(1000n, 6n)
        ).send({ from: addresses[0] }).wait();

        // advance time by ~12 hours
        let currentEpoch = await cc.rollup.getEpoch();
        await cc.rollup.advanceToEpoch(currentEpoch + 60n);

        // mint tokens to account 2
        await token.methods.mint_to_private(
            addresses[1],
            wad(1000n, 6n)
        ).send({ from: addresses[0] }).wait();

        // advance time by ~12 hours
        currentEpoch = await cc.rollup.getEpoch();
        await cc.rollup.advanceToEpoch(currentEpoch + 60n);

        // mint tokens to account 3
        await token.methods.mint_to_private(
            addresses[2],
            wad(1000n, 6n)
        ).send({ from: addresses[0] }).wait();
    });

    // test("e2e", async () => {
    //     const donationAmount = wad(1n, 6n);

    //     // create authwits
    //     const { nonce, authwit: donationAuthwit } = await privateTransferAuthwit(
    //         token,
    //         donator,
    //         admin.getAddress(), // should be escrow
    //         emitter.address,
    //         donationAmount
    //     );
    //     const { authwit: feeAuthwit } = await privateTransferAuthwit(
    //         token,
    //         donator,
    //         admin.getAddress(), //should be escrow
    //         wormhole.address,
    //         2n,
    //         nonce
    //     );

    //     // create wormhole payload
    //     // todo: inject evm vault address
    //     const targetVaultAddress = "0x009cbB8f91d392856Cb880d67c806Aa731E3d686";
    //     const chainId = 2; // gotta figure this shit out
    //     const wormholePayload = createMessageArrays(targetVaultAddress, chainId);
    //     // attempt to publish
    //     const receipt = await emitter
    //         .withWallet(donator)
    //         .methods.bridge(wormholePayload, donationAmount, nonce)
    //         .send({
    //             from: donator.getAddress(),
    //             authWitnesses: [donationAuthwit, feeAuthwit]
    //         })
    //         .wait();
    //     console.log("sent");

    //     expect(receipt).toBeDefined();
    //     console.log("initialized the message on l2");
    // });
});