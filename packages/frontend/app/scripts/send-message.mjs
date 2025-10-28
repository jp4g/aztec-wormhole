// src/send-message.mjs
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { AztecAddress, Contract, createAztecNodeClient, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import EmitterJSON from "../artifacts/emitter/Emitter.json" assert { type: "json" };
import WormholeJSON from "../artifacts/wormhole/Wormhole.json" assert { type: "json" };

import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
// import { WormholeEmitterContract } from "../artifacts/emitter/Emitter.ts";
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MockGuardians, MockEmitter } from './mock-wormhole.mjs';
import fetch from 'node-fetch';

const EmitterContractArtifact = loadContractArtifact(EmitterJSON);
const WormholeContractArtifact = loadContractArtifact(WormholeJSON);

const {
  PXE_URL = 'http://localhost:8080',
  NEXT_PUBLIC_TOKEN_ADDRESS,
  NEXT_PUBLIC_EMITTER_ADDRESS,
  NEXT_PUBLIC_WORMHOLE_ADDRESS 
} = process.env;

// Read donation data passed from the API route
function getDonationData() {
  if (!process.env.DONATION_DATA) {
    console.log("No donation data found in environment variables");
    return null;
  }

  try {
    const encodedData = process.env.DONATION_DATA;
    const jsonStr = Buffer.from(encodedData, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Error parsing donation data:", error);
    return null;
  }
}


// Convert a string to a Uint8Array of specific length
function stringToUint8Array(str, length) {
  const buf = new Uint8Array(length);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  
  // Copy as much as we can
  for (let i = 0; i < Math.min(encoded.length, length); i++) {
    buf[i] = encoded[i];
  }
  
  return buf;
}

// Convert hex string address to Uint8Array of 31 bytes (padded with zeros)
function hexAddressToUint8Array(hexAddress) {
  // Remove 0x prefix if present
  if (hexAddress.startsWith('0x')) {
    hexAddress = hexAddress.substring(2);
  }
  
  // Ensure the hex string is the right length (40 characters for 20 bytes)
  if (hexAddress.length !== 40) {
    throw new Error(`Invalid address length: ${hexAddress.length} chars, expected 40`);
  }
  
  // Create a new Uint8Array to hold the address (31 bytes total)
  const addressBytes = new Uint8Array(31);
  addressBytes.fill(0); // Fill with zeros initially
  
  // Convert each pair of hex characters to a byte (first 20 bytes)
  for (let i = 0; i < 20; i++) {
    const byteHex = hexAddress.substring(i*2, i*2+2);
    addressBytes[i] = parseInt(byteHex, 16);
  }
  
  return addressBytes;
}

// Convert chain ID to a 31-byte array in the expected format
function chainIdToUint8Array(chainId) {
  const chainIdBytes = new Uint8Array(31);
  chainIdBytes.fill(0); // Fill with zeros initially
  
  // Place chain ID at the beginning in little-endian format
  chainIdBytes[0] = chainId & 0xff;        // Lower byte (0x14 for 10004)
  chainIdBytes[1] = (chainId >> 8) & 0xff; // Upper byte (0x27 for 10004)
  
  // Add the array index at the end for debugging
  chainIdBytes[30] = 2;  // This is the second array
  
  return chainIdBytes;
}

// Helper function to debug a Uint8Array
function debugArray(name, array) {
  console.log(`${name} - Length: ${array.length}, First 5 bytes: [${Array.from(array.slice(0, 5)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}], as hex: 0x${Buffer.from(array).toString('hex').substring(0, 10)}...`);
}

function createMessageArrays(donationAddress, arbChainId, verificationData) {
  // Create arrays: [donationAddress, arbChainId, msg1, msg2, msg3, msg4, msg5]
  const msgArrays = [donationAddress, arbChainId];
  
  // Create 5 additional arrays for user data
  for (let i = 0; i < 5; i++) {
    const arr = new Uint8Array(31);
    arr.fill(0);
    msgArrays.push(arr);
  }

  // For debugging, add a distinctive byte to the end of each array
  for (let i = 0; i < msgArrays.length; i++) {
    msgArrays[i][30] = i + 1;  // Last byte of each array = array index + 1
  }
  
  return msgArrays;
}

// Guardian private key for signing VAAs in sandbox mode
const GUARDIAN_PRIVATE_KEY = "cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0";

async function signAndSubmitVAA(tx, NEXT_PUBLIC_EMITTER_ADDRESS, chainId, payload) {
  try {
    console.log("\n=== Signing VAA with MockGuardians ===");

    // Get the sequence number from the transaction (you may need to extract this from logs)
    // For now, using a simple incrementing sequence
    const sequence = BigInt(Date.now()); // Temporary - should come from Wormhole event

    // Create mock emitter
    const mockEmitter = new MockEmitter(
      NEXT_PUBLIC_EMITTER_ADDRESS.toString().replace('0x', ''),
      chainId,
      Number(sequence)
    );

    // Publish the message
    const published = mockEmitter.publishMessage(
      1, // nonce
      payload,
      1  // consistency level
    );

    // Sign with MockGuardians
    const guardians = new MockGuardians(0, [GUARDIAN_PRIVATE_KEY]);
    const signedVAA = guardians.addSignatures(published, [0]);

    console.log(`Signed VAA (${signedVAA.length} bytes)`);
    console.log(`VAA hex: ${signedVAA.toString('hex').substring(0, 64)}...`);

    // Submit to mock-spy
    const mockSpyUrl = process.env.MOCK_SPY_URL || 'http://localhost:8081';
    console.log(`\nSubmitting VAA to mock-spy at ${mockSpyUrl}/submit-vaa`);

    const response = await fetch(`${mockSpyUrl}/submit-vaa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vaaBytes: signedVAA.toString('hex')
      })
    });

    if (!response.ok) {
      throw new Error(`Mock-spy returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    console.log('✅ VAA submitted successfully to mock-spy');
    console.log('Mock-spy will forward to relayer via gRPC');

    return result;
  } catch (error) {
    console.error('❌ Failed to sign and submit VAA:', error);
    throw error;
  }
}

async function main() {
  // Get donation data from environment variable
  const donationData = getDonationData();

  // Extract amount from donation data, default to 35 if not provided
  const userAmount = donationData?.amount || 35;
  console.log(`Using amount from user input: ${userAmount}`);
  
  // Connect to PXE
  const pxe = createPXEClient(PXE_URL);
  const node = createAztecNodeClient(PXE_URL);
  await waitForPXE(pxe);
  console.log(`Connected to PXE at ${PXE_URL}`);

  // Get wallets
  const [ownerWallet, receiverWallet] = await getInitialTestAccountsWallets(pxe);
  const ownerAddress = ownerWallet.getAddress();
  console.log(`Owner address: ${ownerAddress}`);
  console.log(`Receiver address: ${receiverWallet.getAddress()}`);
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Load addresses from file or use hardcoded defaults

  const emitterAddress = AztecAddress.fromString(NEXT_PUBLIC_EMITTER_ADDRESS);
  console.log(`Using emitter at ${NEXT_PUBLIC_EMITTER_ADDRESS}`);

  // EXISTING WORMHOLE AND TOKEN CONTRACT ADDRESSES

  console.log("Getting token contract...");
  const tokenInstance = await node.getContract(NEXT_PUBLIC_TOKEN_ADDRESS);
  console.log("A")
  await pxe.registerContract({
    instance: tokenInstance,
    artifact: TokenContractArtifact
  });
  console.log("B")
  const token = await Contract.at(NEXT_PUBLIC_TOKEN_ADDRESS, TokenContractArtifact, ownerWallet);
  console.log("C")
  const noncePath = join(__dirname, '../assets/nonce.json');
  const nonce_file_data = JSON.parse(readFileSync(noncePath, 'utf8'));

  // Safe BigInt handling
  const current_nonce = nonce_file_data.token_nonce
    ? BigInt(nonce_file_data.token_nonce)
    : 0n;

  const token_nonce = current_nonce + 1n;

  const new_nonce_data = { token_nonce: token_nonce.toString() };

  writeFileSync(noncePath, JSON.stringify(new_nonce_data, null, 2));  
  console.log(`Using token nonce: ${token_nonce}`);
  
  // First, set up the private auth witness for the Wormhole contract
  const tokenTransferAction = token.methods.transfer_in_private(
    ownerAddress, 
    receiverWallet.getAddress(),
    2n,
    token_nonce  
  ); 

  console.log("Generating private authwit for token transfer...");
  const wormholeWitness = await ownerWallet.createAuthWit(
    {
      caller: emitterAddress,
      action: tokenTransferAction
    },
    true
  );

  // Now create the donation action and private auth witness with dynamic amount
  const donationAction = token.methods.transfer_in_private(
    ownerWallet.getAddress(),
    receiverWallet.getAddress(),
    BigInt(userAmount), // Use dynamic amount instead of hardcoded 35n
    token_nonce 
  );
  console.log(`Generating private authwit for donation of ${userAmount} tokens...`);

  const donationWitness = await ownerWallet.createAuthWit({ 
    caller: emitterAddress, 
    action: donationAction 
  });

  console.log("Getting emitter contract...");
  const emitterInstance = await node.getContract(emitterAddress);
  await pxe.registerContract({
    instance: emitterInstance,
    artifact: EmitterContractArtifact
  });
  const wormholeInstance = await node.getContract(AztecAddress.fromString(NEXT_PUBLIC_WORMHOLE_ADDRESS));
  await pxe.registerContract({
    instance: wormholeInstance,
    artifact: WormholeContractArtifact
  });
  const emitterContract = await Contract.at(emitterAddress, EmitterContractArtifact, ownerWallet);
  
  // The vault address we want to appear in the logs
  const targetVaultAddress = "0x009cbB8f91d392856Cb880d67c806Aa731E3d686";
  console.log(`Target vault address: ${targetVaultAddress}`);
  
  // Create arbitrum address and vault address - these are passed directly to the contract
  const vault_address = hexAddressToUint8Array(targetVaultAddress);
  
  const arb_chain_id = 10_004; // Arbitrum chain ID
  const arb_chain_id_as_u8_31 = chainIdToUint8Array(arb_chain_id);

  // Create message arrays with user data (5 arrays of 31 bytes each)
  console.log("Donation data: ", donationData);
  const msgArrays = createMessageArrays(vault_address, arb_chain_id_as_u8_31, donationData);

  // Log what's going to be sent
  console.log("About to send transaction with:");
  console.log("- Vault address (20 bytes- padded to 31 bytes)");
  console.log("- Arbitrum ChainID (31 bytes including padding)");
  console.log(`- Amount: ${userAmount} (from user input)`);
  console.log("- 5 message arrays of 31 bytes each");
  console.log("  The contract will create 8 arrays of 31 bytes total (first 3 for addresses + 5 from us)");
  console.log("  Total bytes in final payload should be: 8 * 31 = 248 bytes");

  console.log("Calling emitter verify_and_publish...");

  try {
    console.log("Inputs: ");
    console.log("Msg arrays: ", msgArrays);
    console.log("Amount: ", userAmount);
    console.log("Token nonce: ", token_nonce);
    console.log("keys", Object.keys(emitterContract.methods));
    const built = await emitterContract.methods.bridge(
      msgArrays,            // Message arrays (5 arrays of 31 bytes each)
      BigInt(userAmount),   // Amount
      token_nonce           // Token nonce
    );
    console.log("built tx");
    const sent = await built.send({
      privateAuthWitnesses: [donationWitness, wormholeWitness],
      from: ownerAddress
    });
    console.log("sent tx");
    const tx = await sent.wait();
    console.log("settled tx");

    console.log("Transaction sent! Hash:", tx.txHash);
    console.log("Block number:", tx.blockNumber);

    console.log("Transaction completed successfully!");
    console.log(`✅ Amount ${userAmount} sent successfully via cross-chain transaction`);

    // Sign and submit VAA to mock-spy
    // The payload should be the message arrays converted to bytes
    const payload = Buffer.concat(msgArrays.map(arr => Buffer.from(arr)));
    await signAndSubmitVAA(
      tx,
      NEXT_PUBLIC_EMITTER_ADDRESS,
      56, // Aztec chain ID
      payload
    );

    return tx;
  } catch (txError) {
    console.error("Error sending transaction:", txError);
    if (txError.message) {
      console.error("Error message:", txError.message);
    }
    if (txError.stack) {
      console.error("Error stack:", txError.stack);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error in send-message script: ${err}`);
  if (err.stack) {
    console.error("Error stack:", err.stack);
  }
  process.exit(1);
});
