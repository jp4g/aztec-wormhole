#!/bin/bash
LOG_FILE="/home/jpag/Playground/aztec/crosschain/aztec-wormhole/logs/vaa-status.log"
BRIDGE="0000000000000000000000004a672b89aa25e14647ac06716c48bdbb181e627d"

while true; do
    echo "=== $(date) ===" >> "$LOG_FILE"
    
    # Check Wormhole API for our bridge's VAAs
    RESULT=$(curl -s "https://api.testnet.wormholescan.io/api/v1/vaas/10003/$BRIDGE?pageSize=5" 2>&1)
    COUNT=$(echo "$RESULT" | jq '.data | length' 2>/dev/null || echo "0")
    
    if [ "$COUNT" != "0" ] && [ "$COUNT" != "null" ]; then
        echo "FOUND $COUNT VAAs from our bridge!" >> "$LOG_FILE"
        echo "$RESULT" | jq '.data[] | {sequence, timestamp, txHash}' >> "$LOG_FILE"
        echo "VAA FOUND! Check $LOG_FILE"
        exit 0
    else
        echo "No VAAs yet from bridge $BRIDGE" >> "$LOG_FILE"
    fi
    
    sleep 60
done
