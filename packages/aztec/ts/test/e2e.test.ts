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
import {
    createPublicClient,
    createWalletClient,
    getContract,
    HDAccount,
    http,
    PublicClient,
    WalletClient,
} from 'viem';
import { mnemonicToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import {
    DonationABI,
    DonationBytecode,
    DonationContract,
    VaultABI,
    VaultBytecode,
    VaultContract
} from "../src/eth/artifacts";
import { MockGuardians } from "@certusone/wormhole-sdk/lib/cjs/mock";

const {
    L1_RPC_URL = "http://localhost:8545",
    L2_NODE_URL = "http://localhost:8080",
    MNEMONIC = "test test test test test test test test test test test junk"
} = process.env;


const GUARDIAN_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
// type WormholePayload: Array
describe("EVM Wormhole Crosschain Test", () => {

    let account: HDAccount;
    let publicClient: PublicClient;
    let walletClient: WalletClient;

    let donationContract: DonationContract;
    let vaultContract: VaultContract;

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
        // set up evm stuff
        account = mnemonicToAccount(MNEMONIC);
        const addressBuffer = Buffer.from(account.address.slice(2), 'hex');
        const pubkeyX = Buffer.from(account.publicKey.slice(2, 66), 'hex');
        const pubkeyY = Buffer.from(account.publicKey.slice(66, 130), 'hex');
        console.log("Guardian Address bytes: ", Array.from(addressBuffer));
        console.log("Guardian pubkey x bytes: ", Array.from(pubkeyX));
        console.log("Guardian pubkey y bytes: ", Array.from(pubkeyY));
        publicClient = createPublicClient({
            chain: anvil,
            transport: http()
        });
        walletClient = createWalletClient({
            account,
            chain: anvil,
            transport: http(),
        });

        // deploy donation contract
        const donationHash = await walletClient.deployContract({
            abi: DonationABI,
            account,
            args: [account.address],
            bytecode: DonationBytecode,
            chain: anvil
        });

        const donationReceipt = await publicClient.waitForTransactionReceipt({
            hash: donationHash,
        });

        donationContract = getContract({
            address: donationReceipt.contractAddress!,
            abi: DonationABI,
            client: {
                public: publicClient,
                wallet: walletClient
            }
        });

        console.log("deployed donation")

        const wormholeAddress: `0x${string}` = "0x6b9C8671cdDC8dEab9c719bB87cBd3e782bA6a35";
        const wormholeChainId = 10003;
        const evmChainId = 31337;
        const finality = 2;

        // deploy vault contract
        const vaultHash = await walletClient.deployContract({
            abi: VaultABI,
            account,
            args: [
                wormholeAddress,
                wormholeChainId,
                evmChainId,
                finality,
                donationReceipt.contractAddress
            ],
            bytecode: VaultBytecode,
            chain: anvil
        });

        const vaultReceipt = await publicClient.waitForTransactionReceipt({
            hash: vaultHash,
        });
        vaultContract = getContract({
            address: vaultReceipt.contractAddress!,
            abi: VaultABI,
            client: {
                public: publicClient,
                wallet: walletClient
            }
        });
        console.log("Deployed evm contracts noice");

        // set up mock guardian
        let guardians = new MockGuardians(1, [GUARDIAN_KEY]);

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

        // 
    });

    test("with flat map", async () => {
        const bridgeAmount = wad(1n, 6n);

        // execute bridge transaction
        const receipt = await bridgeOutPrivate(
            true, // use flat
            wallet,
            alice,
            bridge,
            token,
            bridgeAmount,
            vaultContract.address
        );

        expect(receipt).toBeDefined();
        console.log("Initialized message on l2");
    });
});