import { AccountWallet, PXE, Fr, AztecAddress, createPXEClient, AztecNode } from "@aztec/aztec.js";
import {} from "@aztec/aztec.js/contracts"
import { getInitialTestAccountsManagers } from "@aztec/accounts/testing";
import { TokenContract } from "@aztec/noir-contracts.js/Token"
import { WormholeContract, WormholeEmitterContract } from "../src/artifacts";
import { TOKEN_METADATA, FIXED_WORMHOLE_FEE } from "../src/constants";
import { deployTokenContract, deployWormholeContract, deployWormholeEmitterContract, privateTransferAuthwit } from "../src/contract";
import { bootstrapClients, wad } from "../src/utils";
import { createMessageArrays } from "../src/wormhole/utils";
import { CheatCodes }

describe("EVM Wormhole Crosschain Test", () => {
    let pxe: PXE;
    let node: AztecNode;
    let cc: CheatCodes

    let admin: AccountWallet;
    let receiver: AccountWallet;
    let donator: AccountWallet;

    let token: TokenContract;
    let wormhole: WormholeContract;
    let emitter: WormholeEmitterContract;

    beforeAll(async () => {
        // setup PXE connections
        ({pxe, node} = await bootstrapClients());

        console.log("PXE connected");

        // get accounts
        const wallets = await Promise.all(
            (await getInitialTestAccountsManagers(pxe)).map(m => m.register())
        );
        admin = wallets[0];
        receiver = wallets[1];
        donator = wallets[2];
        
        // deploy contracts
        token = await deployTokenContract(admin, TOKEN_METADATA);
        wormhole = await deployWormholeContract(admin, { wormhole: 1, evm: 1 }, token.address);
        emitter = await deployWormholeEmitterContract(admin, token.address, wormhole.address);

        console.log("Admin: ", admin.getAddress().toString());
        console.log("Receiver: ", receiver.getAddress().toString());
        console.log("Donator: ", donator.getAddress().toString());
        console.log("Token deployed at:", token.address.toString());
        console.log("Wormhole deployed at:", wormhole.address.toString());
        console.log("Emitter deployed at:", emitter.address.toString());
        // mint tokens
        for (const wallet of wallets) {
            await token
                .methods.mint_to_private(
                    wallet.getAddress(),
                    wad(10n, 6n)
                )
                .send({ from: admin.getAddress() })
                .wait();
        };
    });


    test("e2e", async () => {
        const donationAmount = wad(1n, 6n);

        // create authwits
        const { nonce, authwit: donationAuthwit } = await privateTransferAuthwit(
            token,
            donator,
            admin.getAddress(), // should be escrow
            emitter.address,
            donationAmount
        );
        const { authwit: feeAuthwit } = await privateTransferAuthwit(
            token,
            donator,
            admin.getAddress(), //should be escrow
            wormhole.address,
            2n,
            nonce
        );

        // create wormhole payload
        // todo: inject evm vault address
        const targetVaultAddress = "0x009cbB8f91d392856Cb880d67c806Aa731E3d686";
        const chainId = 2; // gotta figure this shit out
        const wormholePayload = createMessageArrays(targetVaultAddress, chainId);
        // attempt to publish
        const receipt = await emitter
            .withWallet(donator)
            .methods.bridge(wormholePayload, donationAmount, nonce)
            .send({
                from: donator.getAddress(),
                authWitnesses: [donationAuthwit, feeAuthwit]
            })
            .wait();
        console.log("sent");

        expect(receipt).toBeDefined();
        console.log("initialized the message on l2");
    });
});