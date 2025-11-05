export function createMessageArrays(
    donationAddress: string | Uint8Array,
    chainId: number | Uint8Array,
): number[][] {
    // parse inputs
    if (typeof donationAddress === 'string')
        donationAddress = hexAddressToUint8Array(donationAddress);
    if (typeof chainId === 'number')
        chainId = chainIdToUint8Array(chainId);

    // validate parsed inputs (maybe redundant)
    if (donationAddress.length !== 31) 
        throw new Error(`Donation address must be 31 bytes`);
    if (chainId.length !== 31)
        throw new Error(`Chain id buffer must be 31 bytes`);

    // create slots
    const slots = [donationAddress, chainId];
    for (let i = 0; i < 5; i++) {
        const arr = new Uint8Array(31);
        arr.fill(0);
        slots.push(arr);
    }
    for (let i = 0; i < slots.length; i++) {
        slots[i][30] = i + 1;
    }
    
    // cast as to number[][]
    return slots.map(arr1 => Array.from(arr1));
}

export function hexAddressToUint8Array(hexAddress: string): Uint8Array {
    const normalized = hexAddress.startsWith('0x') ? hexAddress.slice(2) : hexAddress;
    if (normalized.length !== 40) {
        throw new Error(`Invalid address length: ${normalized.length} chars, expected 40`);
    }

    const addressBytes = new Uint8Array(31);
    for (let i = 0; i < 20; i++) {
        const byteHex = normalized.substring(i * 2, i * 2 + 2);
        addressBytes[i] = parseInt(byteHex, 16);
    }

    return addressBytes;
}

function chainIdToUint8Array(chainId: number): Uint8Array {
    if (!Number.isInteger(chainId) || chainId < 0) {
        throw new Error(`Invalid chain id: ${chainId}`);
    }

    const chainIdBytes = new Uint8Array(31);
    chainIdBytes.fill(0);
    chainIdBytes[0] = chainId & 0xff;
    chainIdBytes[1] = (chainId >> 8) & 0xff;
    chainIdBytes[30] = 2;

    return chainIdBytes;
}