use aztec::{
    protocol_types::{
        traits::{Serialize, Deserialize, Packable},
        address::AztecAddress,
    }
};

#[derive(Serialize, Deserialize, Packable, Eq)]
pub struct Config {
    pub token_address: AztecAddress,
    pub wormhole_address: AztecAddress,
    pub chain_id: u8,
}

impl Config {
    pub fn new(token_address: AztecAddress, wormhole_address: AztecAddress, chain_id: u8) -> Self {
        Self { token_address, wormhole_address, chain_id }
    }
}