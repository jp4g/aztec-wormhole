import { utils, Wallet } from 'ethers';

const SIGNATURE_PAYLOAD_LEN = 66;

function toBuffer(value: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') {
    if (value.startsWith('0x')) {
      return Buffer.from(value.slice(2), 'hex');
    }
    return Buffer.from(value, 'hex');
  }
  throw new TypeError('Unsupported value type');
}

function keccak256(data: Buffer | Uint8Array | string): Buffer {
  const hexData = `0x${toBuffer(data).toString('hex')}`;
  return Buffer.from(utils.arrayify(utils.keccak256(hexData)));
}

function ethPrivateToPublic(privateKey: string): Buffer {
  const walletKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const uncompressed = utils.computePublicKey(walletKey, false); // 0x04 + 64 byte key
  const publicKeyBuffer = Buffer.from(uncompressed.slice(2), 'hex'); // drop 0x
  const hashed = keccak256(publicKeyBuffer.slice(1)); // skip uncompressed prefix
  return hashed.subarray(12); // last 20 bytes
}

function ethSignWithPrivate(privateKey: string, digest: Buffer | Uint8Array | string) {
  const walletKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const wallet = new Wallet(walletKey);
  const hexDigest = `0x${toBuffer(digest).toString('hex')}`;
  return wallet._signingKey().signDigest(hexDigest);
}

export class MockGuardians {
  private setIndex: number;
  private readonly signers: Array<{ index: number; key: string }>;

  constructor(setIndex: number, keys: string[]) {
    this.setIndex = setIndex;
    this.signers = keys.map((key, index) => ({ index, key }));
  }

  getPublicKeys(): Buffer[] {
    return this.signers.map((guardian) => ethPrivateToPublic(guardian.key));
  }

  updateGuardianSetIndex(setIndex: number) {
    this.setIndex = setIndex;
  }

  addSignatures(message: Buffer, guardianIndices: number[]) {
    if (guardianIndices.length === 0) {
      throw new Error('guardianIndices.length == 0');
    }

    const signers = this.signers.filter((signer) => guardianIndices.includes(signer.index));
    const sigStart = 6;
    const numSigners = signers.length;
    const signedVaa = Buffer.alloc(sigStart + SIGNATURE_PAYLOAD_LEN * numSigners + message.length);

    signedVaa.write(message.toString('hex'), sigStart + SIGNATURE_PAYLOAD_LEN * numSigners, 'hex');
    signedVaa.writeUInt8(1, 0);
    signedVaa.writeUInt32BE(this.setIndex, 1);
    signedVaa.writeUInt8(numSigners, 5);

    const hash = keccak256(keccak256(message));

    for (let i = 0; i < numSigners; ++i) {
      const signer = signers.at(i);
      if (!signer) {
        throw new Error('signer == undefined');
      }

      const signature = ethSignWithPrivate(signer.key, hash);
      const start = sigStart + i * SIGNATURE_PAYLOAD_LEN;

      signedVaa.writeUInt8(signer.index, start);
      signedVaa.write(signature.r.slice(2), start + 1, 'hex');
      signedVaa.write(signature.s.slice(2), start + 33, 'hex');
      signedVaa.writeUInt8(signature.recoveryParam ?? (signature.v === 27 ? 0 : 1), start + 65);
    }

    return signedVaa;
  }
}

export class MockEmitter {
  private readonly chain: number;
  private readonly address: Buffer;
  private sequence: bigint;

  constructor(emitterAddress: string, chain: number, startSequence?: number | bigint) {
    this.chain = chain;
    const address = Buffer.from(emitterAddress, 'hex');
    if (address.length !== 32) {
      throw new Error('emitterAddress.length != 32');
    }
    this.address = address;
    this.sequence = startSequence === undefined ? 0n : BigInt(startSequence);
  }

  publishMessage(
    nonce: number,
    payload: Buffer,
    consistencyLevel: number,
    timestamp?: number,
    uptickSequence = true,
  ) {
    if (uptickSequence) {
      this.sequence += 1n;
    }

    const message = Buffer.alloc(51 + payload.length);
    message.writeUInt32BE(timestamp === undefined ? 0 : timestamp, 0);
    message.writeUInt32BE(nonce, 4);
    message.writeUInt16BE(this.chain, 8);
    message.write(this.address.toString('hex'), 10, 'hex');
    message.writeBigUInt64BE(this.sequence, 42);
    message.writeUInt8(consistencyLevel, 50);
    message.write(payload.toString('hex'), 51, 'hex');
    return message;
  }
}

export class MockEthereumEmitter extends MockEmitter {
  constructor(emitterAddress: string, chain = 2) {
    super(emitterAddress, chain);
  }
}
