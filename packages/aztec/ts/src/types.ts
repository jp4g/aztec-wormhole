import { AztecAddress } from "@aztec/aztec.js/addresses";

export type BridgeConfig = {
    token_address: AztecAddress;
    wormhole_address: AztecAddress;
    chain_id: bigint;
}