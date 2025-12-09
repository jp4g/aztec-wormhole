import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { BaseWallet } from "@aztec/aztec.js/wallet";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { TxReceipt } from "@aztec/stdlib/tx";
import { TokenBridgeContract } from "../artifacts";
import { privateTransferAuthwit } from "./token";
import { BridgeConfig, TokenConfig, RemoteTokenInfo, TestMessage } from "../types";
import { hexAddressToUint8Array } from "../wormhole";
import { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";

/**
 * Configure a token for bridging (admin only)
 */
export async function setTokenConfig(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract,
    tokenAddress: AztecAddress,
    enabled: boolean,
    isNative: boolean,
    decimals: number,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    return await bridge
        .withWallet(wallet)
        .methods
        .set_token_config(tokenAddress, enabled, isNative, decimals)
        .send(opts.send)
        .wait(opts.wait);
}

/**
 * Configure remote token mapping (admin only)
 */
export async function setRemoteToken(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract,
    localToken: AztecAddress,
    remoteChainId: number,
    remoteToken: number[],  // [u8; 32]
    enabled: boolean,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    return await bridge
        .withWallet(wallet)
        .methods
        .set_remote_token(localToken, remoteChainId, remoteToken, enabled)
        .send(opts.send)
        .wait(opts.wait);
}

/**
 * Register an emitter from a remote chain (admin only)
 */
export async function registerEmitter(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract,
    chainId: number,
    emitterAddress: number[],  // [u8; 32]
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    return await bridge
        .withWallet(wallet)
        .methods
        .register_emitter(chainId, emitterAddress)
        .send(opts.send)
        .wait(opts.wait);
}

/**
 * Bridge tokens out publicly (Aztec -> EVM)
 */
export async function bridgeOutPublic(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract,
    token: TokenContract,
    tokenAddress: AztecAddress,
    amount: bigint,
    destinationChainId: number,
    recipient: string,  // hex address
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    bridge = bridge.withWallet(wallet);

    const recipientBytes = Array.from(hexAddressToUint8Array(recipient));
    const feeNonce = Fr.ZERO;
    const tokenNonce = Fr.ZERO;

    return await bridge
        .methods
        .bridge_out_public(
            tokenAddress,
            amount,
            destinationChainId,
            recipientBytes,
            feeNonce,
            tokenNonce
        )
        .send(opts.send)
        .wait(opts.wait);
}

/**
 * Bridge tokens out privately (Aztec -> EVM)
 * Requires passing config values since private functions can't read public storage
 */
export async function bridgeOutPrivate(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract,
    token: TokenContract,
    tokenAddress: AztecAddress,
    amount: bigint,
    destinationChainId: number,
    recipient: string,  // hex address
    // Config values that must be passed for private execution
    wormholeAddress: AztecAddress,
    chainId: number,
    remoteToken: number[],  // [u8; 32]
    isNative: boolean,
    decimals: number,
    messageFee: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    bridge = bridge.withWallet(wallet);

    const authWitnesses = [];
    let tokenNonce = Fr.ZERO;
    let feeNonce = Fr.ZERO;

    // Create authwit for token transfer/burn
    if (amount > 0n) {
        const transferMethod = isNative ? "transfer_to_public" : "burn_private";
        const { nonce, authwit } = await privateTransferAuthwit(
            token,
            wallet,
            from,
            transferMethod,
            bridge.address,
            amount
        );
        authWitnesses.push(authwit);
        tokenNonce = nonce;
    }

    // Create authwit for fee payment if needed
    if (messageFee > 0n) {
        const { nonce, authwit } = await privateTransferAuthwit(
            token,
            wallet,
            from,
            "transfer_in_private",
            wormholeAddress,
            messageFee
        );
        authWitnesses.push(authwit);
        feeNonce = nonce;
    }

    const recipientBytes = Array.from(hexAddressToUint8Array(recipient));

    return await bridge
        .methods
        .bridge_out_private(
            tokenAddress,
            amount,
            destinationChainId,
            recipientBytes,
            feeNonce,
            tokenNonce,
            wormholeAddress,
            chainId,
            remoteToken,
            isNative,
            decimals,
            messageFee
        )
        .send({ authWitnesses, ...opts.send })
        .wait(opts.wait);
}

/**
 * Bridge tokens in from EVM (requires VAA)
 */
export async function bridgeInPrivate(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract,
    vaaBytes: number[],  // [u8; 2000]
    vaaLength: number,
    destinationToken: AztecAddress,
    recipient: AztecAddress,
    normalizedAmount: bigint,
    sourceChainId: number,
    wormholeAddress: AztecAddress,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    return await bridge
        .withWallet(wallet)
        .methods
        .bridge_in_private(
            vaaBytes,
            vaaLength,
            destinationToken,
            recipient,
            normalizedAmount,
            sourceChainId,
            wormholeAddress
        )
        .send(opts.send)
        .wait(opts.wait);
}

/**
 * Get bridge configuration
 */
export async function getBridgeConfig(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract
): Promise<BridgeConfig> {
    const config = await bridge
        .withWallet(wallet)
        .methods
        .get_config()
        .simulate({ from });
    return config as BridgeConfig;
}

/**
 * Get token configuration
 */
export async function getTokenConfig(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract,
    tokenAddress: AztecAddress
): Promise<TokenConfig> {
    const config = await bridge
        .withWallet(wallet)
        .methods
        .get_token_config(tokenAddress)
        .simulate({ from });
    return config as TokenConfig;
}

/**
 * Get remote token info
 */
export async function getRemoteToken(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract,
    localToken: AztecAddress,
    remoteChainId: number
): Promise<RemoteTokenInfo> {
    const info = await bridge
        .withWallet(wallet)
        .methods
        .get_remote_token(localToken, remoteChainId)
        .simulate({ from });
    return info as RemoteTokenInfo;
}

/**
 * Get message fee
 */
export async function getMessageFee(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract
): Promise<bigint> {
    return await bridge
        .withWallet(wallet)
        .methods
        .get_message_fee()
        .simulate({ from });
}

/**
 * Send a test message to another chain (Aztec -> EVM)
 */
export async function sendTestMessage(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract,
    destinationChainId: number,
    value: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    const feeNonce = Fr.ZERO;
    return await bridge
        .withWallet(wallet)
        .methods
        .send_test_message(destinationChainId, value, feeNonce)
        .send(opts.send)
        .wait(opts.wait);
}

/**
 * Receive a test message from another chain (simulates relayer action)
 */
export async function receiveTestMessage(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract,
    sourceChainId: number,
    sender: bigint,
    value: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    return await bridge
        .withWallet(wallet)
        .methods
        .receive_test_message(sourceChainId, sender, value)
        .send(opts.send)
        .wait(opts.wait);
}

/**
 * Get the last received test message
 */
export async function getLastTestMessage(
    wallet: BaseWallet,
    from: AztecAddress,
    bridge: TokenBridgeContract
): Promise<TestMessage> {
    const result = await bridge
        .withWallet(wallet)
        .methods
        .get_last_test_message()
        .simulate({ from });

    // Result is a tuple [value, fromChain, sender]
    return {
        value: result[0] as bigint,
        fromChain: Number(result[1]),
        sender: result[2] as bigint,
    };
}
