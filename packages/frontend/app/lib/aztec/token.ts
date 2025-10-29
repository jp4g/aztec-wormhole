import { AccountWallet, AuthWitness, AztecAddress, ContractFunctionInteraction, Fr, SendMethodOptions, WaitOpts } from "@aztec/aztec.js";
import { TokenContract } from "@aztec/noir-contracts.js/Token";

export async function mintTokensToPublic(
    token: TokenContract,
    minter: AccountWallet,
    recipient: AztecAddress,
    amount: bigint,
    opts: { send: SendMethodOptions, wait: WaitOpts } = { send: { from: minter.getAddress() }, wait: {} },
): Promise<void> {
    await token.methods.mint_to_public(recipient, amount)
        .send(opts.send)
        .wait(opts.wait);
}

export async function mintTokensToPrivate(
    token: TokenContract,
    minter: AccountWallet,
    recipient: AztecAddress,
    amount: bigint,
    opts: { send: SendMethodOptions, wait: WaitOpts } = { send: { from: minter.getAddress() }, wait: {} },
): Promise<void> {
    await token.methods.mint_to_private(recipient, amount)
        .send(opts.send)
        .wait(opts.wait);
}

export async function publicTransferAuthwit(
    token: TokenContract,
    from: AccountWallet,
    to: AztecAddress,
    caller: AztecAddress,
    amount: bigint,
    nonce?: Fr
): Promise<Fr> {
    if (!nonce) {
        nonce = Fr.random();
    }
    const action = token.methods.transfer_in_public(
        from.getAddress(),
        to,
        amount,
        nonce
    );
    // do you need to send this??
    await from.setPublicAuthWit({ caller, action }, true);
    return nonce;
}

export async function privateTransferAuthwit(
    token: TokenContract,
    from: AccountWallet,
    to: AztecAddress,
    caller: AztecAddress,
    amount: bigint,
    nonce?: Fr
): Promise<{ authwit: AuthWitness; nonce: Fr }> {
    if (!nonce) {
        nonce = Fr.random();
    }
    const action = token.methods.transfer_in_private(
        from.getAddress(),
        to,
        amount,
        nonce
    );
    const authwit = await from.createAuthWit({ caller, action });
    return { authwit, nonce };
}