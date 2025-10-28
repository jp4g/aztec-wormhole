use aztec::{
    protocol_types::{
        traits::{Serialize, Deserialize, Packable},
        address::AztecAddress,
    }
};

#[derive(Serialize, Deserialize, Packable, Eq)]
pub struct Config {
    pub bridge_address: AztecAddress,
    pub token_address: AztecAddress,
    pub wormhole_address: AztecAddress,
}

impl Config {
    pub fn new(
        bridge_address: AztecAddress,
        token_address: AztecAddress,
        wormhole_address: AztecAddress,
    ) -> Self {
        Self {
            bridge_address,
            token_address,
            wormhole_address,
        }
    }
}