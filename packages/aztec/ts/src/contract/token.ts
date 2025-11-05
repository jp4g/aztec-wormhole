import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { BaseWallet } from "@aztec/aztec.js/wallet";
import { AuthWitness } from "@aztec/stdlib/auth-witness";
import { TokenContract } from "@aztec/noir-contracts.js/Token";

export async function privateTransferAuthwit(
    token: TokenContract,
    wallet: BaseWallet,
    from: AztecAddress,
    functionCall: "transfer_in_private" | "transfer_to_public",
    caller: AztecAddress,
    amount: bigint,
): Promise<{ nonce: Fr, authwit: AuthWitness }> {
    const nonce = Fr.random();
    const call = await token.methods[functionCall](
        from,
        caller,
        amount,
        nonce
    ).getFunctionCall();
    const authwit = await wallet.createAuthWit(from, { call, caller });
    return { nonce, authwit };
}

export async function balanceOfPrivate(
    token: TokenContract,
    owner: AztecAddress,
    from: AztecAddress
): Promise<bigint> {
    return await token.methods.balance_of_private(owner).simulate({ from });
}

export async function balanceOfPublic(
    token: TokenContract,
    owner: AztecAddress,
    from: AztecAddress
): Promise<bigint> {
    return await token.methods.balance_of_public(owner).simulate({ from });
}