import { AztecAddress, EthAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { BaseWallet } from "@aztec/aztec.js/wallet";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { TxReceipt } from "@aztec/stdlib/tx";
import { WormholeBridgeContract } from "../artifacts";
import { privateTransferAuthwit } from "./token";
import { BridgeConfig } from "../types";
import { hexAddressToUint8Array } from "../wormhole";
import { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";

export async function bridgeOutPrivate(
    flat: boolean, // ISSUE REPRODUCTION FLAG - TO BE REMOVED
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: WormholeBridgeContract,
    token: TokenContract,
    bridgeAmount: bigint,
    receiverAddress: string,
    wormholeAddress?: AztecAddress,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    bridge = bridge.withWallet(wallet);
    // create bridge transfer authwit
    console.log("tryna make authwit")
    const authWitnesses = [];
    let bridgeNonce = Fr.ZERO;
    let feeNonce = Fr.ZERO;

    if (bridgeAmount > 0n) {
        const { nonce, authwit } = await privateTransferAuthwit(
            token,
            wallet,
            from,
            // "transfer_to_public",
            "transfer_in_private",
            bridge.address, // caller/ recipient
            bridgeAmount
        );
        authWitnesses.push(authwit);
        bridgeNonce = nonce;
    }


    // check for message fee
    const fee = await bridge.methods.get_wormhole_message_fee().simulate({ from });
    console.log("Fee: ", fee);
    if (fee > 0n) {
        // get wormhole address
        if (!wormholeAddress) {
            const config = await getBridgeConfig(wallet, from, bridge);
            wormholeAddress = config.wormhole_address;
        }
        const { nonce, authwit } = await privateTransferAuthwit(
            token,
            wallet,
            from,
            "transfer_in_private",
            wormholeAddress, // caller/ recipient
            fee
        );
        authWitnesses.push(authwit);
        feeNonce = nonce;
    }

    // bridge inputs
    const recipientAddress = Array.from(hexAddressToUint8Array(receiverAddress));

    // attempt to bridge out
    // ISSUE REPRODUCTION STEP - REPLACE WITH `methods.bridge_out_private` ALWAYS
    // const method = flat ? "bridge_out_private_flat" : "bridge_out_private"
    const method = "bridge_out_private"
    return await bridge
        .methods[method](
            recipientAddress,
            bridgeAmount,
            bridgeNonce,
            feeNonce
        )
        .send({ authWitnesses, ...opts.send })
        .wait(opts.wait);
}

export async function getBridgeConfig(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: WormholeBridgeContract
): Promise<BridgeConfig> {
    const config = await bridge
        .withWallet(wallet)
        .methods
        .get_config()
        .simulate({ from });
    return config as BridgeConfig;
}