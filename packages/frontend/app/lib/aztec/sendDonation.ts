import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
  AztecAddress,
  Contract,
  createAztecNodeClient,
  createPXEClient,
  EthAddress,
  loadContractArtifact,
  PXE,
  waitForPXE,
  type AztecNode
} from '@aztec/aztec.js';
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import {
  WormholeEmitterContract,
  WormholeContract,
  WormholeEmitterContractArtifact,
  WormholeContractArtifact
} from '@aztec-wormhole/contracts/artifacts';
import { chainIdToUint8Array, createMessageArrays, hexAddressToUint8Array } from '../wormhole/messagePayload';
import { signAndSubmitVaa } from '../wormhole/signing';
import { DonationData, EnvironmentConfig, SendDonationResult } from '../types';
import { getContract } from '.';
import { privateTransferAuthwit } from './token';

function readEnvironment(): EnvironmentConfig {
  const {
    PXE_URL = 'http://localhost:8080',
    NEXT_PUBLIC_TOKEN_ADDRESS,
    NEXT_PUBLIC_EMITTER_ADDRESS,
    NEXT_PUBLIC_WORMHOLE_ADDRESS,
    NEXT_PUBLIC_CONTRACT_ADDRESS,
    MOCK_SPY_URL = 'http://localhost:8081',
  } = process.env;

  if (!NEXT_PUBLIC_TOKEN_ADDRESS || !NEXT_PUBLIC_EMITTER_ADDRESS || !NEXT_PUBLIC_WORMHOLE_ADDRESS) {
    throw new Error('Token, emitter, and wormhole addresses must be provided via environment variables.');
  }

  return {
    pxeUrl: PXE_URL,
    mockSpyUrl: MOCK_SPY_URL,
    tokenAddress: AztecAddress.fromString(NEXT_PUBLIC_TOKEN_ADDRESS),
    emitterAddress: AztecAddress.fromString(NEXT_PUBLIC_EMITTER_ADDRESS),
    wormholeAddress: AztecAddress.fromString(NEXT_PUBLIC_WORMHOLE_ADDRESS),
    vaultAddress: "0x0000000000000000000000000000000000000000", // TODO: Replace with actual vault address
  };
}

async function bootstrapClients(pxeUrl: string) {
  const pxe = createPXEClient(pxeUrl);
  const node = createAztecNodeClient(pxeUrl);
  await waitForPXE(pxe);
  return { pxe, node };
}

function resolveNoncePath() {
  return path.join(process.cwd(), 'packages/frontend/app/assets/nonce.json');
}

function readAndIncrementTokenNonce(filePath: string): bigint {
  const raw = readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw) as { token_nonce?: string };
  const currentNonce = data.token_nonce ? BigInt(data.token_nonce) : 0n;
  const nextNonce = currentNonce + 1n;
  writeFileSync(filePath, JSON.stringify({ token_nonce: nextNonce.toString() }, null, 2));
  return nextNonce;
}

function buildPayload({
  vaultAddress,
  chainId,
}: {
  vaultAddress: string;
  chainId: number;
}) {
  const vault = hexAddressToUint8Array(vaultAddress);
  const chain = chainIdToUint8Array(chainId);
  const messageArrays = createMessageArrays(vault, chain);
  const payload = Buffer.concat(messageArrays.map((arr) => Buffer.from(arr)));
  return { messageArrays, payload };
}

export async function sendDonationMessage(donation: DonationData): Promise<SendDonationResult> {
  if (!donation || typeof donation.amount !== 'number') {
    throw new Error('Donation amount is required.');
  }

  const config = readEnvironment();
  const { pxe, node } = await bootstrapClients(config.pxeUrl);
  const [ownerWallet, receiverWallet] = await getInitialTestAccountsWallets(pxe);

  // Load contracts
  const tokenContract = await getContract<TokenContract>(
    ownerWallet,
    node,
    config.tokenAddress,
    TokenContractArtifact,
    TokenContract
  );

  // const tokenNonce = readAndIncrementTokenNonce(resolveNoncePath());

  // const { authwit: donationAuthWit, nonce } = await privateTransferAuthwit(
  //   tokenContract,
  //   ownerWallet,
  //   receiverWallet.getAddress(),
  //   config.emitterAddress,
  //   BigInt(donation.amount),
  // );

  // const wormholeWitness = await privateTransferAuthwit(
  //   tokenContract,

  // )

  // const emitterContract = await getContract<WormholeEmitterContract>(
  //   ownerWallet,
  //   node,
  //   config.emitterAddress,
  //   WormholeEmitterContractArtifact,
  //   WormholeEmitterContract
  // );

  // const { messageArrays, payload } = buildPayload({
  //   vaultAddress: config.vaultAddress,
  //   chainId: 10_004,
  // });

  // const built = await emitterContract.methods.bridge(
  //   messageArrays,
  //   BigInt(donation.amount),
  //   tokenNonce,
  // );

  // const sent = await built.send({
  //   privateAuthWitnesses: [donationWitness, wormholeWitness],
  //   from: ownerWallet.getAddress(),
  // });

  // const tx = await sent.wait();

  // await signAndSubmitVaa({
  //   emitterAddress: config.emitterAddress,
  //   chainId: 56,
  //   payload,
  //   mockSpyUrl: config.mockSpyUrl,
  // });

  // return {
  //   txHash: tx.txHash,
  //   blockNumber: tx.blockNumber,
  // };
}
