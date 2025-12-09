import { AztecAddress } from "@aztec/aztec.js/addresses";
import { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";
import { AztecNode } from "@aztec/aztec.js/node";
import { BaseWallet } from "@aztec/aztec.js/wallet";
import { TokenContract, TokenContractArtifact } from "@aztec/noir-contracts.js/Token";
import { TOKEN_METADATA } from "../constants";
import {
    WormholeContract,
    WormholeContractArtifact,
    TokenBridgeContract,
    TokenBridgeContractArtifact
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

/**
 * Deploy the TokenBridge contract
 * @param wallet - The wallet to deploy with
 * @param from - The deployer address (will be set as owner)
 * @param wormholeAddress - The Wormhole contract address
 * @param chainId - The Wormhole chain ID for this chain
 * @param messageFee - The fee for Wormhole messages (in smallest unit)
 * @param opts - Send and wait options
 */
export async function deployTokenBridgeContract(
    wallet: BaseWallet,
    from: AztecAddress,
    wormholeAddress: AztecAddress,
    chainId: bigint = 56n,  // Default Aztec Wormhole chain ID
    messageFee: bigint = 0n,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TokenBridgeContract> {
    return await TokenBridgeContract.deploy(
        wallet,
        wormholeAddress,
        chainId,
        from,  // owner
        messageFee
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

export async function getTokenBridgeContract(
    wallet: BaseWallet,
    from: AztecAddress,
    node: AztecNode,
    address: AztecAddress
): Promise<TokenBridgeContract> {
    const instance = await node.getContract(address);
    if (!instance) throw new Error(`TokenBridge contract instance at ${address.toString()} not found`);
    await wallet.registerContract({ instance, artifact: TokenBridgeContractArtifact });
    const bridge = await TokenBridgeContract.at(address, wallet);
    await bridge.methods.sync_private_state().simulate({ from });
    return bridge;
}
