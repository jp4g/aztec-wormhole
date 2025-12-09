use aztec::macros::aztec;

pub mod config;
pub mod utils;

#[aztec]
pub contract TokenBridge {
    use aztec::{
        macros::{
            functions::{initializer, internal, external},
            storage::storage
        },
        protocol_types::{
            address::AztecAddress,
            traits::ToField,
        },
        state_vars::{map::Map, public_mutable::PublicMutable, public_immutable::PublicImmutable},
    };
    use crate::config::{Config, TokenConfig, RemoteTokenInfo, RegisteredEmitter};
    use crate::utils::{encode_transfer_payload, normalize_amount, denormalize_amount, address_to_bytes32};
    use token::Token;
    use wormhole::Wormhole;

    // ============================================================================
    // STORAGE
    // ============================================================================

    #[storage]
    struct Storage<Context> {
        // Core configuration
        config: PublicImmutable<Config, Context>,
        owner: PublicMutable<AztecAddress, Context>,

        // Token configurations: token_address => TokenConfig
        token_configs: Map<AztecAddress, PublicMutable<TokenConfig, Context>, Context>,

        // Remote token mappings: composite key => RemoteTokenInfo
        remote_tokens: Map<Field, PublicMutable<RemoteTokenInfo, Context>, Context>,

        // Registered emitters: chain_id => RegisteredEmitter
        registered_emitters: Map<Field, PublicMutable<RegisteredEmitter, Context>, Context>,

        // Processed VAAs for replay protection: vaa_hash => processed
        processed_vaas: Map<Field, PublicMutable<bool, Context>, Context>,

        // Message fee for Wormhole
        message_fee: PublicMutable<u128, Context>,

        // Test message storage
        last_received_value: PublicMutable<Field, Context>,
        last_received_from_chain: PublicMutable<u16, Context>,
        last_received_sender: PublicMutable<Field, Context>,
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    #[external("public")]
    #[initializer]
    fn constructor(
        wormhole_address: AztecAddress,
        chain_id: u16,
        owner: AztecAddress,
        message_fee: u128,
    ) {
        storage.config.initialize(Config::new(
            AztecAddress::zero(),
            wormhole_address,
            chain_id,
        ));
        storage.owner.write(owner);
        storage.message_fee.write(message_fee);
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    #[external("public")]
    fn set_token_config(
        token: AztecAddress,
        enabled: bool,
        is_native: bool,
        decimals: u8,
    ) {
        let owner = storage.owner.read();
        assert(owner.eq(context.msg_sender().unwrap()), "Caller is not owner");
        storage.token_configs.at(token).write(TokenConfig::new(enabled, is_native, decimals));
    }

    #[external("public")]
    fn set_remote_token(
        local_token: AztecAddress,
        remote_chain_id: u16,
        remote_token: [u8; 32],
        enabled: bool,
    ) {
        let owner = storage.owner.read();
        assert(owner.eq(context.msg_sender().unwrap()), "Caller is not owner");
        let key = _compute_remote_token_key(local_token, remote_chain_id);
        storage.remote_tokens.at(key).write(RemoteTokenInfo::new(remote_token, remote_chain_id, enabled));
    }

    #[external("public")]
    fn register_emitter(
        chain_id: u16,
        emitter_address: [u8; 32],
    ) {
        let owner = storage.owner.read();
        assert(owner.eq(context.msg_sender().unwrap()), "Caller is not owner");
        let key = chain_id as Field;
        storage.registered_emitters.at(key).write(RegisteredEmitter::new(emitter_address, true));
    }

    #[external("public")]
    fn set_message_fee(fee: u128) {
        let owner = storage.owner.read();
        assert(owner.eq(context.msg_sender().unwrap()), "Caller is not owner");
        storage.message_fee.write(fee);
    }

    #[external("public")]
    fn transfer_ownership(new_owner: AztecAddress) {
        let owner = storage.owner.read();
        assert(owner.eq(context.msg_sender().unwrap()), "Caller is not owner");
        storage.owner.write(new_owner);
    }

    // ============================================================================
    // BRIDGE OUT (Aztec -> EVM) - Public version
    // ============================================================================

    #[external("public")]
    fn bridge_out_public(
        token: AztecAddress,
        amount: u128,
        destination_chain_id: u16,
        recipient: [u8; 32],
        fee_nonce: Field,
        token_nonce: Field,
    ) {
        let config = storage.config.read();
        let token_config = storage.token_configs.at(token).read();
        let remote_key = _compute_remote_token_key(token, destination_chain_id);
        let remote_info = storage.remote_tokens.at(remote_key).read();
        let message_fee = storage.message_fee.read();

        // Validate
        assert(token_config.enabled, "Token not enabled");
        assert(remote_info.enabled, "Remote token not enabled");
        assert(amount > 0, "Amount must be greater than zero");

        let sender = context.msg_sender().unwrap();

        // Handle token: burn (bridged) or lock (native)
        if token_config.is_native {
            // Native token: transfer to bridge (lock)
            let _ = Token::at(token).transfer_in_public(
                sender,
                context.this_address(),
                amount,
                token_nonce
            ).call(&mut context);
        } else {
            // Bridged token: burn from sender (public)
            let _ = Token::at(token).burn_public(
                sender,
                amount,
                token_nonce
            ).call(&mut context);
        }

        // Normalize amount
        let normalized_amount = normalize_amount(amount, token_config.decimals);

        // Encode payload
        let source_token = address_to_bytes32(token);
        let sender_bytes = address_to_bytes32(sender);

        let wormhole_payload = encode_transfer_payload(
            source_token,
            remote_info.remote_token,
            sender_bytes,
            recipient,
            normalized_amount,
            config.chain_id,
            destination_chain_id,
        );

        // Publish message through Wormhole (public)
        let _ = Wormhole::at(config.wormhole_address).publish_message_in_public(
            0, // nonce
            wormhole_payload,
            message_fee,
            1, // consistency level
            sender,
            fee_nonce,
        ).call(&mut context);
    }

    // ============================================================================
    // BRIDGE OUT (Aztec -> EVM) - Private version
    // Requires caller to pass config values since private can't read public storage
    // ============================================================================

    #[external("private")]
    fn bridge_out_private(
        token: AztecAddress,
        amount: u128,
        destination_chain_id: u16,
        recipient: [u8; 32],
        fee_nonce: Field,
        token_nonce: Field,
        // Config values passed by caller (verified in public callback)
        wormhole_address: AztecAddress,
        chain_id: u16,
        remote_token: [u8; 32],
        is_native: bool,
        decimals: u8,
        message_fee: u128,
    ) {
        let sender = context.msg_sender().unwrap();

        // Handle token: burn (bridged) or lock (native)
        if is_native {
            // Native token: transfer to bridge (lock)
            let _ = Token::at(token).transfer_to_public(
                sender,
                context.this_address(),
                amount,
                token_nonce
            ).call(&mut context);
        } else {
            // Bridged token: burn from sender
            let _ = Token::at(token).burn_private(
                sender,
                amount,
                token_nonce
            ).call(&mut context);
        }

        // Normalize amount
        let normalized_amount = normalize_amount(amount, decimals);

        // Encode payload
        let source_token = address_to_bytes32(token);
        let sender_bytes = address_to_bytes32(sender);

        let wormhole_payload = encode_transfer_payload(
            source_token,
            remote_token,
            sender_bytes,
            recipient,
            normalized_amount,
            chain_id,
            destination_chain_id,
        );

        // Publish message through Wormhole (private)
        let _ = Wormhole::at(wormhole_address).publish_message_in_private(
            0, // nonce
            wormhole_payload,
            message_fee,
            1, // consistency level
            sender,
            fee_nonce,
        ).call(&mut context);
    }

    // ============================================================================
    // BRIDGE IN (EVM -> Aztec) - Private entry point for VAA verification
    // Caller must pass pre-decoded payload fields to avoid serialization issues
    // ============================================================================

    #[external("private")]
    fn bridge_in_private(
        vaa_bytes: [u8; 2000],
        vaa_length: u32,
        // Pre-decoded payload fields (caller extracts these from payload)
        destination_token: AztecAddress,
        recipient: AztecAddress,
        normalized_amount: u128,
        source_chain_id: u16,
        // Config values (private can't read public storage reliably)
        wormhole_address: AztecAddress,
    ) {
        // 1. Verify VAA through Wormhole contract (private)
        let _ = Wormhole::at(wormhole_address).verify_vaa(
            vaa_bytes,
            vaa_length,
        ).call(&mut context);

        // 2. Enqueue public function to complete the bridge-in
        TokenBridge::at(context.this_address())._complete_bridge_in(
            destination_token,
            recipient,
            normalized_amount,
            source_chain_id,
        ).enqueue(&mut context);
    }

    // ============================================================================
    // BRIDGE IN - Public completion after VAA verification
    // ============================================================================

    #[external("public")]
    #[internal]
    fn _complete_bridge_in(
        destination_token: AztecAddress,
        recipient: AztecAddress,
        normalized_amount: u128,
        source_chain_id: u16,
    ) {
        // 1. Verify emitter is registered for source chain
        let emitter_key = source_chain_id as Field;
        let registered_emitter = storage.registered_emitters.at(emitter_key).read();
        assert(registered_emitter.enabled, "Emitter not registered");

        // 2. Check replay protection using hash of transfer parameters
        let vaa_hash = _compute_vaa_hash(
            source_chain_id,
            destination_token.to_field(),
            normalized_amount,
            recipient.to_field()
        );
        let already_processed = storage.processed_vaas.at(vaa_hash).read();
        assert(!already_processed, "VAA already processed");
        storage.processed_vaas.at(vaa_hash).write(true);

        // 3. Get token config
        let token_config = storage.token_configs.at(destination_token).read();
        assert(token_config.enabled, "Token not enabled");

        // 4. Denormalize amount
        let amount = denormalize_amount(normalized_amount, token_config.decimals);

        // 5. Handle token: unlock (native) or mint (bridged)
        if token_config.is_native {
            // Native token: transfer from bridge to recipient (unlock)
            let _ = Token::at(destination_token).transfer_in_public(
                context.this_address(),
                recipient,
                amount,
                0,
            ).call(&mut context);
        } else {
            // Bridged token: mint to recipient
            let _ = Token::at(destination_token).mint_to_public(
                recipient,
                amount,
            ).call(&mut context);
        }
    }

    // ============================================================================
    // TEST MESSAGE FUNCTIONS
    // ============================================================================

    #[external("public")]
    fn send_test_message(
        destination_chain_id: u16,
        value: Field,
        fee_nonce: Field,
    ) {
        let config = storage.config.read();
        let message_fee = storage.message_fee.read();
        let sender = context.msg_sender().unwrap();

        // Encode test payload: [payload_id(1), sender(32), value(32), source_chain(2), dest_chain(2)] = 69 bytes
        let mut payload: [u8; 69] = [0; 69];
        payload[0] = 3; // PAYLOAD_ID_TEST

        // Encode sender (bytes32)
        let sender_bytes = address_to_bytes32(sender);
        for i in 0..32 {
            payload[1 + i] = sender_bytes[i];
        }

        // Encode value as bytes32
        let value_bytes = value.to_be_bytes::<32>();
        for i in 0..32 {
            payload[33 + i] = value_bytes[i];
        }

        // Encode source chain (this chain)
        payload[65] = (config.chain_id >> 8) as u8;
        payload[66] = config.chain_id as u8;

        // Encode destination chain
        payload[67] = (destination_chain_id >> 8) as u8;
        payload[68] = destination_chain_id as u8;

        // Pack into Wormhole format: [[u8; 31]; 8] = 248 bytes total
        let mut wormhole_payload: [[u8; 31]; 8] = [[0; 31]; 8];
        for slot in 0..8 {
            for byte_idx in 0..31 {
                let payload_idx = slot * 31 + byte_idx;
                if payload_idx < 69 {
                    wormhole_payload[slot][byte_idx] = payload[payload_idx];
                }
            }
        }

        // Publish through Wormhole
        let _ = Wormhole::at(config.wormhole_address).publish_message_in_public(
            0,
            wormhole_payload,
            message_fee,
            1,
            sender,
            fee_nonce,
        ).call(&mut context);
    }

    #[external("public")]
    fn receive_test_message(
        source_chain_id: u16,
        sender: Field,
        value: Field,
    ) {
        // Verify emitter is registered for source chain
        let emitter_key = source_chain_id as Field;
        let registered_emitter = storage.registered_emitters.at(emitter_key).read();
        assert(registered_emitter.enabled, "Emitter not registered");

        // Store the received test message
        storage.last_received_value.write(value);
        storage.last_received_from_chain.write(source_chain_id);
        storage.last_received_sender.write(sender);
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    #[external("utility")]
    unconstrained fn get_config() -> pub Config {
        storage.config.read()
    }

    #[external("utility")]
    unconstrained fn get_owner() -> pub AztecAddress {
        storage.owner.read()
    }

    #[external("utility")]
    unconstrained fn get_token_config(token: AztecAddress) -> pub TokenConfig {
        storage.token_configs.at(token).read()
    }

    #[external("utility")]
    unconstrained fn get_remote_token(local_token: AztecAddress, remote_chain_id: u16) -> pub RemoteTokenInfo {
        let key = _compute_remote_token_key(local_token, remote_chain_id);
        storage.remote_tokens.at(key).read()
    }

    #[external("utility")]
    unconstrained fn get_registered_emitter(chain_id: u16) -> pub RegisteredEmitter {
        let key = chain_id as Field;
        storage.registered_emitters.at(key).read()
    }

    #[external("utility")]
    unconstrained fn get_message_fee() -> pub u128 {
        storage.message_fee.read()
    }

    #[external("utility")]
    unconstrained fn is_vaa_processed(vaa_hash: Field) -> pub bool {
        storage.processed_vaas.at(vaa_hash).read()
    }

    #[external("utility")]
    unconstrained fn get_last_test_message() -> pub (Field, u16, Field) {
        (
            storage.last_received_value.read(),
            storage.last_received_from_chain.read(),
            storage.last_received_sender.read()
        )
    }

    // ============================================================================
    // INTERNAL HELPER FUNCTIONS
    // ============================================================================

    // Simple hash for composite keys - using field arithmetic
    #[contract_library_method]
    fn _compute_remote_token_key(local_token: AztecAddress, remote_chain_id: u16) -> Field {
        local_token.to_field() * 65536 + (remote_chain_id as Field)
    }

    #[contract_library_method]
    fn _compute_vaa_hash(
        source_chain_id: u16,
        sender_field: Field,
        amount: u128,
        recipient_field: Field,
    ) -> Field {
        // Simple hash combining the fields
        (source_chain_id as Field) + sender_field * 2 + (amount as Field) * 3 + recipient_field * 5
    }
}
