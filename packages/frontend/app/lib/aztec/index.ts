import { AccountWallet, AztecAddress, AztecNode, ContractArtifact, ContractBase, createAztecNodeClient } from "@aztec/aztec.js";

export async function getContract<T extends ContractBase>(
    wallet: AccountWallet,
    node: AztecNode,
    contractAddress: AztecAddress,
    artifact: ContractArtifact,
    contractClass: { at(address: AztecAddress, wallet: AccountWallet): Promise<T> }
): Promise<T> {
    const instance = await node.getContract(contractAddress);
    if (!instance) {
        throw new Error(`Contract at address ${contractAddress.toString()} not found`);
    }
    await wallet.registerContract({ instance, artifact })
    return await contractClass.at(contractAddress, wallet)
}