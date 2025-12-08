use aztec::macros::aztec;

pub mod config;
pub mod utils;

#[aztec]
pub contract WormholeBridge {
    use aztec::{
        macros::{
            functions::{initializer, external},
            storage::storage
        }, 
        protocol_types::{
            address::AztecAddress,
        },
        state_vars::{PublicImmutable, DelayedPublicMutable}
    };
    use crate::{config::Config, utils::pack_wormhole_message};
    use token::Token;
    use wormhole::Wormhole;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        fee: DelayedPublicMutable<u128, 87000, Context>, // Delay slightly over 1 day.
    }

    #[initializer]
    #[external("public")]
    fn constructor(
            token_address: AztecAddress,
            wormhole_address: AztecAddress,
            chain_id: u8,
            fee: u128
        ) {
        storage.config.initialize(Config::new(
            token_address,
            wormhole_address,
            chain_id,
        ));
        storage.fee.schedule_value_change(fee);
    }

    #[external("private")]
    fn bridge_out_private(
        recipient_address: [u8; 31],
        amount: u128, // amount of tokens to be donated on chosen chainID
        bridge_nonce: Field,
        fee_nonce: Field,
    ) {
        // 1. read storage
        let config = storage.config.read();
        let wormhole_fee = storage.fee.get_current_value();
        if amount > 0 {
            // 2. Transfer tokens to bridge (donating)
            let _ = Token::at(config.token_address).transfer_to_public(
                context.msg_sender().unwrap(),
                context.this_address(),
                amount,
                bridge_nonce
            ).call(&mut context);
        }
        

        // 3. Pack wormhole payload
        let wormhole_payload = pack_wormhole_message(
            recipient_address,
            config.chain_id,
            amount
        );

        
        // 4. publish message through bridge
        let _ = Wormhole::at(config.wormhole_address).publish_message_in_private(
            1, // wormhole nonce (what does this do?)
            wormhole_payload,
            wormhole_fee, // message_fee: u128
            2, // consistency: u8 (what does this do?)
            context.msg_sender().unwrap(),
            fee_nonce, // message fee authwit nonce
        ).call(&mut context);
    }

    // #[external("private")]
    // fn bridge_out_private_flat(
    //     recipient_address: [u8; 31],
    //     amount: u128, // amount of tokens to be donated on chosen chainID
    //     bridge_nonce: Field,
    //     fee_nonce: Field,
    // ) {
    //     // 1. read storage
    //     let config = storage.config.read();
    //     let wormhole_fee = storage.fee.get_current_value();

    //     // 2. Transfer tokens to bridge (donating)
    //     let _ = Token::at(config.token_address).transfer_to_public(
    //         context.msg_sender().unwrap(),
    //         context.this_address(),
    //         amount,
    //         bridge_nonce
    //     ).call(&mut context);

    //     // 3. Pack wormhole payload
    //     let wormhole_payload = pack_wormhole_message(
    //         recipient_address,
    //         config.chain_id,
    //         amount
    //     );

    //     // 4. publish message through bridge
    //     let _ = Wormhole::at(config.wormhole_address).publish_message_in_private_flat(
    //         1, // wormhole nonce (what does this do?)
    //         wormhole_payload[0],
    //         wormhole_payload[1],
    //         wormhole_payload[2],
    //         wormhole_payload[3],
    //         wormhole_payload[4],
    //         wormhole_payload[5],
    //         wormhole_payload[6],
    //         wormhole_payload[7],
    //         wormhole_fee, // message_fee: u128
    //         2, // consistency: u8 (what does this do?)
    //         context.msg_sender().unwrap(),
    //         fee_nonce, // message fee authwit nonce
    //     ).call(&mut context);
    // }


    #[external("utility")]
    unconstrained fn get_wormhole_message_fee() -> u128 {
        storage.fee.get_current_value()
    }

    #[external("utility")]
    unconstrained fn get_config() -> Config {
        storage.config.read()
    }
}