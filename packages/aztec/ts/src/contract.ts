import { AccountWallet, AuthWitness, AztecAddress, Fr, SendMethodOptions, WaitOpts } from "@aztec/aztec.js";
import { WormholeContract, WormholeEmitterContract } from "./artifacts";
import { TOKEN_METADATA } from "./constants";
import { TokenContract } from "@aztec/noir-contracts.js/Token";

export async function deployTokenContract(
    wallet: AccountWallet,
    tokenMetadata: {name: string, symbol: string, decimals: number} = TOKEN_METADATA,
    opts: { send: SendMethodOptions, wait?: WaitOpts } = { send: { from: wallet.getAddress() } }
): Promise<TokenContract> {
    return await TokenContract.deploy(
        wallet,
        wallet.getAddress(),
        tokenMetadata.name,
        tokenMetadata.symbol,
        tokenMetadata.decimals,
    )
        .send(opts.send)
        .deployed(opts.wait);
}

export async function deployWormholeContract(
    wallet: AccountWallet,
    chainIds: {wormhole: number, evm: number},
    tokenAddress: AztecAddress,
    receiverAddress: AztecAddress = wallet.getAddress(),
    opts: { send: SendMethodOptions, wait?: WaitOpts } = { send: { from: wallet.getAddress() } }
): Promise<WormholeContract> {
    console.log("A", tokenAddress);
    console.log("B", receiverAddress);
    return await WormholeContract.deploy(
        wallet,
        chainIds.wormhole,
        chainIds.evm,
        wallet.getAddress(), // contract owner address
        receiverAddress,
        tokenAddress
    )
        .send(opts.send)
        .deployed(opts.wait);
}

export async function deployWormholeEmitterContract(
    wallet: AccountWallet,
    tokenAddress: AztecAddress,
    wormholeAddress: AztecAddress,
    bridgeAddress: AztecAddress = wallet.getAddress(), // todo: fix to be an actual escrow
    opts: { send: SendMethodOptions, wait?: WaitOpts } = { send: { from: wallet.getAddress() } }
): Promise<WormholeEmitterContract> {
    return await WormholeEmitterContract.deploy(
        wallet,
        bridgeAddress,
        tokenAddress,
        wormholeAddress
    )
        .send(opts.send)
        .deployed(opts.wait);
}

export async function privateTransferAuthwit(
    token: TokenContract,
    from: AccountWallet,
    to: AztecAddress,
    caller: AztecAddress,
    amount: bigint,
    nonce?: Fr
): Promise<{ nonce: Fr, authwit: AuthWitness }> {
    if (!nonce) nonce = Fr.random();
    const action = token.methods.transfer_in_private(
        from.getAddress(),
        to,
        amount,
        nonce
    );
    const authwit = await from.createAuthWit({ action, caller });
    return { nonce, authwit };
}