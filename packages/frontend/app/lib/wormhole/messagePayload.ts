import { MESSAGE_SLOT_LENGTH } from '../constants';

export function stringToUint8Array(str: string, length: number): Uint8Array {
  const buf = new Uint8Array(length);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);

  buf.set(encoded.slice(0, length));
  return buf;
}

export function hexAddressToUint8Array(hexAddress: string): Uint8Array {
  const normalized = hexAddress.startsWith('0x') ? hexAddress.slice(2) : hexAddress;
  if (normalized.length !== 40) {
    throw new Error(`Invalid address length: ${normalized.length} chars, expected 40`);
  }

  const addressBytes = new Uint8Array(MESSAGE_SLOT_LENGTH);
  for (let i = 0; i < 20; i++) {
    const byteHex = normalized.substring(i * 2, i * 2 + 2);
    addressBytes[i] = parseInt(byteHex, 16);
  }

  return addressBytes;
}

export function chainIdToUint8Array(chainId: number): Uint8Array {
  if (!Number.isInteger(chainId) || chainId < 0) {
    throw new Error(`Invalid chain id: ${chainId}`);
  }

  const chainIdBytes = new Uint8Array(MESSAGE_SLOT_LENGTH);
  chainIdBytes.fill(0);
  chainIdBytes[0] = chainId & 0xff;
  chainIdBytes[1] = (chainId >> 8) & 0xff;
  chainIdBytes[30] = 2;

  return chainIdBytes;
}

export function createMessageArrays(donationAddress: Uint8Array, arbChainId: Uint8Array, totalSlots = 7) {
  if (donationAddress.length !== MESSAGE_SLOT_LENGTH) {
    throw new Error(`Donation address must be ${MESSAGE_SLOT_LENGTH} bytes`);
  }
  if (arbChainId.length !== MESSAGE_SLOT_LENGTH) {
    throw new Error(`Chain id buffer must be ${MESSAGE_SLOT_LENGTH} bytes`);
  }

  const slots = [new Uint8Array(donationAddress), new Uint8Array(arbChainId)];

  for (let i = 2; i < totalSlots; i++) {
    const arr = new Uint8Array(MESSAGE_SLOT_LENGTH);
    arr.fill(0);
    slots[i] = arr;
  }

  for (let i = 0; i < slots.length; i++) {
    slots[i][MESSAGE_SLOT_LENGTH - 1] = i + 1;
  }

  return slots;
}
