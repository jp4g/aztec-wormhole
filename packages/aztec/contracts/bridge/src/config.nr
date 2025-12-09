use aztec::protocol_types::{
    traits::{Serialize, Deserialize, Packable},
    address::AztecAddress,
};

/// Bridge configuration stored as immutable state
#[derive(Serialize, Deserialize, Packable, Eq)]
pub struct Config {
    pub token_address: AztecAddress,      // Local token to bridge
    pub wormhole_address: AztecAddress,   // Wormhole contract address
    pub chain_id: u16,                    // This chain's Wormhole chain ID (e.g., 56 for Aztec)
}

impl Config {
    pub fn new(token_address: AztecAddress, wormhole_address: AztecAddress, chain_id: u16) -> Self {
        Self { token_address, wormhole_address, chain_id }
    }
}

/// Token configuration for bridging
#[derive(Serialize, Deserialize, Packable, Eq)]
pub struct TokenConfig {
    pub enabled: bool,      // Whether this token can be bridged
    pub is_native: bool,    // True = lock/unlock, False = mint/burn
    pub decimals: u8,       // Token decimals for normalization
}

impl TokenConfig {
    pub fn new(enabled: bool, is_native: bool, decimals: u8) -> Self {
        Self { enabled, is_native, decimals }
    }

    pub fn default() -> Self {
        Self { enabled: false, is_native: false, decimals: 18 }
    }
}

/// Remote token mapping
#[derive(Serialize, Deserialize, Packable, Eq)]
pub struct RemoteTokenInfo {
    pub remote_token: [u8; 32],  // Token address on remote chain (as bytes32)
    pub remote_chain_id: u16,    // Wormhole chain ID of remote chain
    pub enabled: bool,           // Whether bridging to this remote is enabled
}

impl RemoteTokenInfo {
    pub fn new(remote_token: [u8; 32], remote_chain_id: u16, enabled: bool) -> Self {
        Self { remote_token, remote_chain_id, enabled }
    }

    pub fn default() -> Self {
        Self { remote_token: [0; 32], remote_chain_id: 0, enabled: false }
    }
}

/// Registered emitter for a remote chain
#[derive(Serialize, Deserialize, Packable, Eq)]
pub struct RegisteredEmitter {
    pub emitter_address: [u8; 32],  // Emitter address as bytes32
    pub enabled: bool,
}

impl RegisteredEmitter {
    pub fn new(emitter_address: [u8; 32], enabled: bool) -> Self {
        Self { emitter_address, enabled }
    }

    pub fn default() -> Self {
        Self { emitter_address: [0; 32], enabled: false }
    }
}
