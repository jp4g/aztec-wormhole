// import { AccountWallet, AuthWitness, Fr, SendMethodOptions, WaitOpts } from "@aztec/aztec.js";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { WormholeContract, WormholeContractArtifact, WormholeEmitterContract, WormholeEmitterContractArtifact } from "./artifacts";
import { TOKEN_METADATA } from "./constants";
import { TokenContract, TokenContractArtifact } from "@aztec/noir-contracts.js/Token";
import { BaseWallet } from "@aztec/aztec.js/wallet";
import { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";
import { AuthWitness } from "@aztec/stdlib/auth-witness";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecNode } from "@aztec/aztec.js/node";

export async function deployTokenContract(
    wallet: BaseWallet,
    from: AztecAddress,
    tokenMetadata: { name: string, symbol: string, decimals: number } = TOKEN_METADATA,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TokenContract> {
    return await TokenContract.deploy(
        wallet,
        from,
        tokenMetadata.name,
        tokenMetadata.symbol,
        tokenMetadata.decimals,
    )
        .send(opts.send)
        .deployed(opts.wait);
}

export async function deployWormholeContract(
    wallet: BaseWallet,
    from: AztecAddress,
    chainIds: { wormhole: number, evm: number },
    tokenAddress: AztecAddress,
    receiverAddress: AztecAddress = from,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<WormholeContract> {
    return await WormholeContract.deploy(
        wallet,
        chainIds.wormhole,
        chainIds.evm,
        from, // contract owner address
        receiverAddress,
        tokenAddress
    )
        .send(opts.send)
        .deployed(opts.wait);
}

export async function deployWormholeEmitterContract(
    wallet: BaseWallet,
    from: AztecAddress,
    tokenAddress: AztecAddress,
    wormholeAddress: AztecAddress,
    bridgeAddress: AztecAddress = from, // todo: fix to be an actual escrow
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
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
    wallet: BaseWallet,
    from: AztecAddress,
    to: AztecAddress,
    caller: AztecAddress,
    amount: bigint,
    nonce?: Fr
): Promise<{ nonce: Fr, authwit: AuthWitness }> {
    if (!nonce) nonce = Fr.random();
    const call = await token.methods.transfer_in_private(
        from,
        to,
        amount,
        nonce
    ).getFunctionCall();
    const authwit = await wallet.createAuthWit(from, { call, caller });
    return { nonce, authwit };
}

export async function getTokenContract(
    wallet: BaseWallet,
    from: AztecAddress,
    node: AztecNode,
    address: AztecAddress
): Promise<TokenContract> {
    const instance = await node.getContract(address);
    if (!instance) throw new Error(`Token contract instance at ${address.toString()} not found`);
    await wallet.registerContract({ instance, artifact: TokenContractArtifact });
    const token = await TokenContract.at(address, wallet);
    await token.methods.sync_private_state().simulate({ from });
    return token;
}

export async function getWormholeContract(
    wallet: BaseWallet,
    from: AztecAddress,
    node: AztecNode,
    address: AztecAddress
): Promise<WormholeContract> {
    const instance = await node.getContract(address);
    if (!instance) throw new Error(`Wormhole contract instance at ${address.toString()} not found`);
    await wallet.registerContract({ instance, artifact: WormholeContractArtifact });
    const wormhole = await WormholeContract.at(address, wallet);
    await wormhole.methods.sync_private_state().simulate({ from });
    return wormhole;
}

export async function getWormholeEmitterContract(
    wallet: BaseWallet,
    from: AztecAddress,
    node: AztecNode,
    address: AztecAddress
): Promise<WormholeEmitterContract> {
    const instance = await node.getContract(address);
    if (!instance) throw new Error(`Wormhole emitter contract instance at ${address.toString()} not found`);
    await wallet.registerContract({ instance, artifact: WormholeEmitterContractArtifact });
    const wormholeEmitter = await WormholeEmitterContract.at(address, wallet);
    await wormholeEmitter.methods.sync_private_state().simulate({ from });
    return wormholeEmitter;
}