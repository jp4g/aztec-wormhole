import { AztecAddress } from "@aztec/aztec.js/addresses";
import { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";
import { AztecNode } from "@aztec/aztec.js/node";
import { BaseWallet } from "@aztec/aztec.js/wallet";
import { TokenContract, TokenContractArtifact } from "@aztec/noir-contracts.js/Token";
import { TOKEN_METADATA } from "../constants";
import {
    WormholeContract,
    WormholeContractArtifact,
    WormholeBridgeContract,
    WormholeBridgeContractArtifact
} from "../artifacts";

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

export async function deployWormholeBridgeContract(
    wallet: BaseWallet,
    from: AztecAddress,
    tokenAddress: AztecAddress,
    wormholeAddress: AztecAddress,
    chainId: bigint = 57n,
    wormholeFee: bigint = 0n,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<WormholeBridgeContract> {
    return await WormholeBridgeContract.deploy(
        wallet,
        tokenAddress,
        wormholeAddress,
        chainId,
        wormholeFee
    )
        .send(opts.send)
        .deployed(opts.wait);
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

export async function getWormholeBridgeContract(
    wallet: BaseWallet,
    from: AztecAddress,
    node: AztecNode,
    address: AztecAddress
): Promise<WormholeBridgeContract> {
    const instance = await node.getContract(address);
    if (!instance) throw new Error(`Wormhole emitter contract instance at ${address.toString()} not found`);
    await wallet.registerContract({ instance, artifact: WormholeBridgeContractArtifact });
    const wormholeEmitter = await WormholeBridgeContract.at(address, wallet);
    await wormholeEmitter.methods.sync_private_state().simulate({ from });
    return wormholeEmitter;
}