use aztec::macros::aztec;

pub mod config;

#[aztec]
pub contract WormholeEmitter {
    use aztec::{
        macros::{
            functions::{initializer, external},
            storage::storage
        }, 
        protocol_types::{
            address::AztecAddress,
            traits::{Deserialize, Serialize, FromField}
        },
        state_vars::PublicImmutable
    };
    use crate::config::Config;
    use token::Token;
    use wormhole::Wormhole;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(
            bridge_address: AztecAddress,
            token_address: AztecAddress,
            wormhole_address: AztecAddress
        ) {
        storage.config.initialize(Config::new(
            bridge_address,
            token_address,
            wormhole_address,
        ));
    }

    #[external("private")]
    fn bridge(
        msg: [[u8;31];7], // Format: [zkDonation Arb Address, Arb chain ID, msg1, msg2, msg3, msg4, msg5]
        amount: u128, // amount of tokens to be donated on chosen chainID
        nonce: Field
    ) {
        // 1. read storage
        let config = storage.config.read();

        // 2. Perform zk Donation
        let _ = Token::at(config.token_address).transfer_in_private(
            context.msg_sender().unwrap(),
            config.bridge_address, // should be set to the bridge address but for demo purposes the user can supply it
            amount,
            nonce
        ).call(&mut context);

        // 3. prepare message
        // MSG = [zkDonation Arb Address, Arb chain ID, Amount, payload]

        let amount_field: Field = amount as Field;
        let payload3: [u8; 31] = amount_field.to_le_bytes();

        // Payload Field 4-8: Message
        // The message is already in the format of 5 u8s, so we can directly use it
        let wormhole_payload = [msg[0], msg[1], payload3, msg[2], msg[3], msg[4], msg[5], msg[6]];
                
        // 4. call publish message
        // Wormhole signature: fn publish_message_in_private(nonce: u64, payloads: [[u8; 31]; 8], message_fee: u128, consistency: u8, from: AztecAddress, token_nonce: Field)
        let _ = Wormhole::at(config.wormhole_address).publish_message_in_private(
            1, // nonce: u64
            wormhole_payload, // payloads: [[u8; 31]; 8]
            2, // message_fee: u128
            2, // consistency: u8
            context.msg_sender().unwrap(), // from: AztecAddress
            nonce, // token_nonce: Field
        ).call(&mut context);
    }
}