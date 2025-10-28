import { AccountWallet, AztecAddress, SendMethodOptions, WaitOpts } from "@aztec/aztec.js";
import { WormholeContract, WormholeEmitterContract } from "./artifacts";
import { TOKEN_METADATA } from "./constants";
import { TokenContract } from "@aztec/noir-contracts.js/Token";

export async function deployToken(
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

export async function deployEmitterContract(
    wallet: AccountWallet,
    tokenAddress: AztecAddress,
    wormholeAddress: AztecAddress,
    bridgeAddress: AztecAddress = wallet.getAddress(), // todo: fix to be an actual escrow
    opts: { send: SendMethodOptions, wait?: WaitOpts } = { send: { from: wallet.getAddress() } }
): Promise<WormholeEmitterContract> {
    return await WormholeEmitterContract.deploy(
        wallet,
        tokenAddress,
        wormholeAddress,
        bridgeAddress
    )
        .send(opts.send)
        .deployed(opts.wait);
}