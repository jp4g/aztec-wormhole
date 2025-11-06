import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { TokenContract } from "@aztec/noir-contracts.js/Token"
import { WormholeContract, WormholeBridgeContract } from "../src/artifacts";
import { WORMHOLE_CHAIN_IDS } from "../src/constants";
import { wad } from "../src/utils";
import { CheatCodes } from "@aztec/aztec/testing";
import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TestDateProvider } from "@aztec/foundation/timer"
import { EthAddress } from "@aztec/stdlib/block";
import { bridgeOutPrivate } from "../src/contract/bridge";
import {
    deployTokenContract,
    deployWormholeContract,
    deployWormholeBridgeContract,
} from "../src/contract/deploy";



const {
    L1_RPC_URL = "http://localhost:8545",
    L2_NODE_URL = "http://localhost:8080",
} = process.env;

// type WormholePayload: Array


describe("EVM Wormhole Crosschain Test", () => {


    let node: AztecNode;
    let cc: CheatCodes;
    let wallet: TestWallet;

    let admin: AztecAddress;
    let alice: AztecAddress;
    let bob: AztecAddress;

    let token: TokenContract;
    let wormhole: WormholeContract;
    let bridge: WormholeBridgeContract;

    beforeAll(async () => {
        // set up clients
        node = createAztecNodeClient(L2_NODE_URL);
        cc = await CheatCodes.create([L1_RPC_URL], node, new TestDateProvider());

        // setup wallet
        const accountData = await getInitialTestAccountsData();
        wallet = await TestWallet.create(node);
        const accounts = await Promise.all(accountData.map(async account => {
            await wallet.createSchnorrAccount(account.secret, account.salt);
            return account;
        }));
        admin = accounts[0].address;
        alice = accounts[1].address;
        bob = accounts[2].address;

        // set up token
        token = await deployTokenContract(wallet, admin);

        // setup wormhole
        wormhole = await deployWormholeContract(
            wallet,
            admin,
            WORMHOLE_CHAIN_IDS,
            token.address
        );

        // set up emitter / bridge
        bridge = await deployWormholeBridgeContract(
            wallet,
            admin,
            token.address,
            wormhole.address,
        );

        // we need to advance time by 87000 seconds (~24 hours) for wormhole
        // delayed mutable to take effect. But we cannot advance 24 hours at once
        // so we will mint, advance ~12 hours, mint, advance 12 hours, mint
        // this will mine a tx within expiry date to advance while minting tokens

        // mint tokens to account 1
        await token.methods.mint_to_private(
            admin,
            wad(1000n, 6n)
        ).send({ from: admin }).wait();

        // advance time by ~12 hours
        let currentEpoch = await cc.rollup.getEpoch();
        await cc.rollup.advanceToEpoch(currentEpoch + 60n);

        // mint tokens to account 2
        await token.methods.mint_to_private(
            alice,
            wad(1000n, 6n)
        ).send({ from: admin }).wait();

        // advance time by ~12 hours
        currentEpoch = await cc.rollup.getEpoch();
        await cc.rollup.advanceToEpoch(currentEpoch + 60n);

        // mint tokens to account 3
        await token.methods.mint_to_private(
            bob,
            wad(1000n, 6n)
        ).send({ from: admin }).wait();
    });

    test("with flat map", async () => {
        const bridgeAmount = wad(1n, 6n);
        const receiverAddress = EthAddress.fromString("0x1234567890abcdef1234567890abcdef12345678");

        // execute bridge transaction
        const receipt = await bridgeOutPrivate(
            true, // use flat
            wallet,
            alice,
            bridge,
            token,
            bridgeAmount,
            receiverAddress
        );

        expect(receipt).toBeDefined();
        console.log("Initialized message on l2");
    });

    test("without flat map", async () => {
        const bridgeAmount = wad(1n, 6n);
        const receiverAddress = EthAddress.fromString("0x1234567890abcdef1234567890abcdef12345678");

        // execute bridge transaction
        const receipt = await bridgeOutPrivate(
            false, // dont use flat
            wallet,
            alice,
            bridge,
            token,
            bridgeAmount,
            receiverAddress
        );

        expect(receipt).toBeDefined();
        console.log("Initialized message on l2");
    });
});