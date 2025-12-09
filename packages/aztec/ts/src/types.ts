import { AztecAddress } from "@aztec/aztec.js/addresses";

export type BridgeConfig = {
    token_address: AztecAddress;
    wormhole_address: AztecAddress;
    chain_id: bigint;
}

export type TokenConfig = {
    enabled: boolean;
    is_native: boolean;
    decimals: number;
}

export type RemoteTokenInfo = {
    remote_token: number[];  // [u8; 32]
    remote_chain_id: number;
    enabled: boolean;
}

export type RegisteredEmitter = {
    emitter_address: number[];  // [u8; 32]
    enabled: boolean;
}

export type TestMessage = {
    value: bigint;
    fromChain: number;
    sender: bigint;
}
