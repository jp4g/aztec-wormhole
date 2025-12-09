use aztec::protocol_types::traits::ToField;
use aztec::protocol_types::address::AztecAddress;

/// Payload ID for token transfers (must match EVM TokenBridge)
pub global PAYLOAD_ID_TRANSFER: u8 = 1;

/// Payload ID for asset metadata registration
pub global PAYLOAD_ID_ASSET_META: u8 = 2;

/// Payload ID for test messages
pub global PAYLOAD_ID_TEST: u8 = 3;

/// Decimals used for cross-chain normalization (must match EVM TokenBridge)
pub global NORMALIZED_DECIMALS: u8 = 8;

/// Encode transfer payload into Wormhole message format
/// Returns [[u8; 31]; 8] for Wormhole publish_message
pub fn encode_transfer_payload(
    source_token: [u8; 32],
    destination_token: [u8; 32],
    sender: [u8; 32],
    recipient: [u8; 32],
    normalized_amount: u128,
    source_chain_id: u16,
    destination_chain_id: u16,
) -> [[u8; 31]; 8] {
    // Create the full 165-byte payload
    let mut payload: [u8; 165] = [0; 165];

    // Byte 0: payload ID
    payload[0] = PAYLOAD_ID_TRANSFER;

    // Bytes 1-32: source token (32 bytes)
    for i in 0..32 {
        payload[1 + i] = source_token[i];
    }

    // Bytes 33-64: destination token (32 bytes)
    for i in 0..32 {
        payload[33 + i] = destination_token[i];
    }

    // Bytes 65-96: sender (32 bytes)
    for i in 0..32 {
        payload[65 + i] = sender[i];
    }

    // Bytes 97-128: recipient (32 bytes)
    for i in 0..32 {
        payload[97 + i] = recipient[i];
    }

    // Bytes 129-160: amount as uint256 (32 bytes, big-endian)
    // u128 fits in 16 bytes, pad with leading zeros (already zeroed)
    let amount_bytes: [u8; 32] = (normalized_amount as Field).to_be_bytes();
    for i in 0..32 {
        payload[129 + i] = amount_bytes[i];
    }

    // Bytes 161-162: source chain ID (2 bytes, big-endian)
    let src_bytes: [u8; 32] = (source_chain_id as Field).to_be_bytes();
    payload[161] = src_bytes[30];
    payload[162] = src_bytes[31];

    // Bytes 163-164: destination chain ID (2 bytes, big-endian)
    let dst_bytes: [u8; 32] = (destination_chain_id as Field).to_be_bytes();
    payload[163] = dst_bytes[30];
    payload[164] = dst_bytes[31];

    // Pack into Wormhole format: [[u8; 31]; 8] = 248 bytes total
    let mut wormhole_payload: [[u8; 31]; 8] = [[0; 31]; 8];

    for slot in 0..8 {
        for byte_idx in 0..31 {
            let payload_idx = slot * 31 + byte_idx;
            if payload_idx < 165 {
                wormhole_payload[slot][byte_idx] = payload[payload_idx];
            }
        }
    }

    wormhole_payload
}

/// Normalize amount from local decimals to 8 decimals
pub fn normalize_amount(amount: u128, decimals: u8) -> u128 {
    if decimals > NORMALIZED_DECIMALS {
        let diff = (decimals - NORMALIZED_DECIMALS) as Field;
        let divisor = (10 as Field).pow_32(diff) as u128;
        amount / divisor
    } else if decimals < NORMALIZED_DECIMALS {
        let diff = (NORMALIZED_DECIMALS - decimals) as Field;
        let multiplier = (10 as Field).pow_32(diff) as u128;
        amount * multiplier
    } else {
        amount
    }
}

/// Denormalize amount from 8 decimals to local decimals
pub fn denormalize_amount(amount: u128, decimals: u8) -> u128 {
    if decimals > NORMALIZED_DECIMALS {
        let diff = (decimals - NORMALIZED_DECIMALS) as Field;
        let multiplier = (10 as Field).pow_32(diff) as u128;
        amount * multiplier
    } else if decimals < NORMALIZED_DECIMALS {
        let diff = (NORMALIZED_DECIMALS - decimals) as Field;
        let divisor = (10 as Field).pow_32(diff) as u128;
        amount / divisor
    } else {
        amount
    }
}

/// Convert AztecAddress to bytes32
pub fn address_to_bytes32(addr: AztecAddress) -> [u8; 32] {
    addr.to_field().to_be_bytes()
}

/// Encode asset metadata payload into Wormhole message format
/// Used to register token metadata on destination chain
/// Format (100 bytes):
/// - bytes1:  payloadId (2 = asset meta)
/// - bytes32: tokenAddress (on origin chain)
/// - uint16:  tokenChain (origin chain ID)
/// - uint8:   decimals
/// - bytes32: symbol (right-padded with zeros)
/// - bytes32: name (right-padded with zeros)
pub fn encode_asset_meta_payload(
    token_address: [u8; 32],
    token_chain: u16,
    decimals: u8,
    symbol: [u8; 32],
    name: [u8; 32],
) -> [[u8; 31]; 8] {
    let mut payload: [u8; 100] = [0; 100];

    // Byte 0: payload ID
    payload[0] = PAYLOAD_ID_ASSET_META;

    // Bytes 1-32: token address
    for i in 0..32 {
        payload[1 + i] = token_address[i];
    }

    // Bytes 33-34: token chain ID
    let chain_bytes: [u8; 32] = (token_chain as Field).to_be_bytes();
    payload[33] = chain_bytes[30];
    payload[34] = chain_bytes[31];

    // Byte 35: decimals
    payload[35] = decimals;

    // Bytes 36-67: symbol
    for i in 0..32 {
        payload[36 + i] = symbol[i];
    }

    // Bytes 68-99: name
    for i in 0..32 {
        payload[68 + i] = name[i];
    }

    // Pack into Wormhole format
    let mut wormhole_payload: [[u8; 31]; 8] = [[0; 31]; 8];
    for slot in 0..8 {
        for byte_idx in 0..31 {
            let payload_idx = slot * 31 + byte_idx;
            if payload_idx < 100 {
                wormhole_payload[slot][byte_idx] = payload[payload_idx];
            }
        }
    }

    wormhole_payload
}
