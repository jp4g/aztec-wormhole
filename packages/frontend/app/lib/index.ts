import { AztecAddress } from "@aztec/aztec.js";
import path from 'path';

export type ChainConfig = {
  pxeUrl: string;
  l2NodeUrl: string;
  l1NodeUrl: string;
  wormholeAddress: AztecAddress;
  tokenAddress: AztecAddress;
  emitterAddress: AztecAddress;
  nonceFilePath: string;
}


export function resolveChainConfig(): ChainConfig {
  const {
    PXE_URL,
    AZTEC_NODE_URL,
    L1_NODE_URL,
    NEXT_PUBLIC_TOKEN_ADDRESS,
    NEXT_PUBLIC_EMITTER_ADDRESS,
    NEXT_PUBLIC_WORMHOLE_ADDRESS,
  } = process.env;
  if (!NEXT_PUBLIC_TOKEN_ADDRESS) {
    throw new Error('NEXT_PUBLIC_TOKEN_ADDRESS is not defined in environment variables');
  }
  if (!NEXT_PUBLIC_EMITTER_ADDRESS) {
    throw new Error('NEXT_PUBLIC_EMITTER_ADDRESS is not defined in environment variables');
  }
  if (!NEXT_PUBLIC_WORMHOLE_ADDRESS) {
    throw new Error('NEXT_PUBLIC_WORMHOLE_ADDRESS is not defined in environment variables');
  }

  const tokenAddress = AztecAddress.fromString(NEXT_PUBLIC_TOKEN_ADDRESS);
  const emitterAddress = AztecAddress.fromString(NEXT_PUBLIC_EMITTER_ADDRESS);
  const wormholeAddress = AztecAddress.fromString(NEXT_PUBLIC_WORMHOLE_ADDRESS);
  const pxeUrl = PXE_URL || 'http://localhost:8080';
  const l2NodeUrl = AZTEC_NODE_URL || 'http://localhost:8080';
  const l1NodeUrl = L1_NODE_URL || 'http://localhost:8080';
  const nonceFilePath = path.join(process.cwd(), 'packages/frontend/app/assets/nonce.json');

  return {
    pxeUrl,
    l2NodeUrl,
    l1NodeUrl,
    tokenAddress,
    emitterAddress,
    wormholeAddress,
    nonceFilePath,
  };
}