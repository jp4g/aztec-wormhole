import { ethers } from 'ethers';
import { VAULT_GETTERS_ABI } from '../constants';
export interface ArbitrumMessageResult {
  rawResult: string;
  decodedAmount?: string;
}

interface FetchConfig {
  providerUrl: string;
  contractAddress: string;
}


export function normalizeHash(hash: string) {
  if (!hash) {
    throw new Error('Transaction hash is required');
  }
  const prefixed = hash.startsWith('0x') ? hash : `0x${hash}`;
  if (!ethers.utils.isHexString(prefixed)) {
    throw new Error('Invalid transaction hash format');
  }
  if (ethers.utils.hexDataLength(prefixed) !== 32) {
    return ethers.utils.hexZeroPad(prefixed, 32);
  }
  return prefixed;
}

async function ensureContractExists(provider: ethers.providers.Provider, contractAddress: string) {
  const code = await provider.getCode(contractAddress);
  if (code === '0x' || !code) {
    throw new Error('No contract deployed at the specified address');
  }
}

export async function fetchArbitrumMessage(
  hash: string,
  { providerUrl, contractAddress }: FetchConfig,
): Promise<ArbitrumMessageResult> {
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  await ensureContractExists(provider, contractAddress);

  const normalizedHash = normalizeHash(hash);
  const bytes32Hash = ethers.utils.hexZeroPad(normalizedHash, 32);

  const contractInterface = new ethers.utils.Interface(VAULT_GETTERS_ABI);
  const callData = contractInterface.encodeFunctionData('getArbitrumMessage', [bytes32Hash]);

  const rawResult = await provider.call({
    to: contractAddress,
    data: callData,
  });

  if (
    !rawResult ||
    rawResult === '0x' ||
    rawResult === '0x0000000000000000000000000000000000000000000000000000000000000000'
  ) {
    return { rawResult };
  }

  try {
    const decoded = contractInterface.decodeFunctionResult('getArbitrumMessage', rawResult);
    return {
      rawResult,
      decodedAmount: decoded[0].toString(),
    };
  } catch {
    const manual = BigInt(rawResult);
    return {
      rawResult,
      decodedAmount: manual.toString(),
    };
  }
}
