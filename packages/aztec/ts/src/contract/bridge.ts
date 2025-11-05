import { AztecAddress, EthAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { BaseWallet } from "@aztec/aztec.js/wallet";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { TxReceipt } from "@aztec/stdlib/tx";
import { WormholeBridgeContract } from "../artifacts";
import { privateTransferAuthwit } from "./token";
import { BridgeConfig } from "../types";
import { hexAddressToUint8Array } from "../wormhole";

export async function bridgeOutPrivate(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: WormholeBridgeContract,
    token: TokenContract,
    bridgeAmount: bigint,
    receiverAddress: EthAddress, // todo: support solana keys
    wormholeAddress?: AztecAddress,
): Promise<TxReceipt> {
    bridge = bridge.withWallet(wallet);
    // create bridge transfer authwit
    console.log("tryna make authwit")
    const authWitnesses = [];
    let feeNonce = Fr.ZERO;
    const { nonce: bridgeNonce, authwit: bridgeAuthwit } = await privateTransferAuthwit(
        token,
        wallet,
        from,
        "transfer_to_public",
        bridge.address, // caller/ recipient
        bridgeAmount
    );
    authWitnesses.push(bridgeAuthwit);

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
    const recipientAddress = Array.from(hexAddressToUint8Array(receiverAddress.toString()));

    // attempt to bridge out
    console.log("recipientAddress", recipientAddress);
    return await bridge
        .methods.bridge_out_private(
            recipientAddress,
            bridgeAmount,
            bridgeNonce,
            feeNonce
        )
        .send({ from, authWitnesses })
        .wait();
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