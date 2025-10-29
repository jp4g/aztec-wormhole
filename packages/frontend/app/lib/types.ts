import { AztecAddress, EthAddress } from "@aztec/aztec.js";

export type EnvironmentConfig = {
    pxeUrl: string;
    mockSpyUrl: string;
    tokenAddress: AztecAddress;
    emitterAddress: AztecAddress;
    wormholeAddress: AztecAddress;
    vaultAddress: string;
}

// post body for donation message
export interface DonationData {
    amount: number;
    [key: string]: unknown;
}

// post response for donation message
export interface SendDonationResult {
    txHash: string;
    blockNumber: number;
}
