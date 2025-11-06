import { AztecNode } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server"
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";
import { isTestnet } from "../../ts/src/utils";
import { getPriorityFeeOptions, getSponsoredPaymentMethod } from "../../ts/src/fees";

export const testnetPriorityFee = 10n; // multiply base fee allowance by 10x
export const testnetTimeout = 3600; // seconds until timeout waiting for send
export const testnetInterval = 3; // seconds between polling for tx

/**
 * In high fee environments (testnet) get send and wait options
 * @param pxe - the PXE to execute with
 * @param withFPC - if true, use sponsored FPC
 * @returns send/ wait options optimized for testnet
 */
export const getTestnetSendWaitOptions = async (
    node: AztecNode,
    wallet: TestWallet,
    from: AztecAddress,
    withFPC: boolean = true,
): Promise<{
    send: SendInteractionOptions,
    wait: WaitOpts
}> => {
    let send: SendInteractionOptions = { from };
    let wait: WaitOpts = {};
    if (await isTestnet(node)) {
        let fee = await getPriorityFeeOptions(node, testnetPriorityFee);
        if (withFPC) {
            const paymentMethod = await getSponsoredPaymentMethod(wallet);
            fee = { ...fee, paymentMethod };
        }
        send = { ...send, fee };
        wait = { timeout: testnetTimeout, interval: testnetInterval };
    }
    return { send, wait };
}
