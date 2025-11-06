pub fn pack_wormhole_message(
    recipient_address: [u8; 31],
    chain_id: u8,
    amount: u128
) -> [[u8; 31]; 8] {
    // serialize values
    let mut chain_id_serialized = [0; 31];
    chain_id_serialized[0] = chain_id;
    let amount_serialized: [u8; 31] = (amount as Field).to_le_bytes();
    // pack payload
    let mut wormhole_payload = [
        recipient_address,
        chain_id_serialized,
        amount_serialized,
        [0; 31],
        [0; 31],
        [0; 31],
        [0; 31],
        [0; 31]
    ];
    // add debugging flag
    for i in 0..8 {
        wormhole_payload[i][30] = (i as u8) + 1;
    }
    wormhole_payload
}