# Wormhole Mock Spy Service

A lightweight mock implementation of the Wormhole spy service for local development. This service allows you to test the relayer flow without connecting to the actual Wormhole Guardian network.

## Architecture

```
Next.js/Test Script → HTTP POST (8081) → Mock Spy → gRPC Stream (7073) → Relayer
     (MockGuardians)
```

The mock spy acts as a bridge between your local test environment and the relayer:
1. Accepts signed VAAs via HTTP POST
2. Streams them to connected relayers via gRPC (using the official spy interface)
3. Allows testing the complete flow without external dependencies

## Features

- **HTTP API**: Simple REST endpoint to submit VAAs
- **gRPC Server**: Implements the official Wormhole spy `SubscribeSignedVAA` interface
- **Multiple Subscribers**: Supports multiple relayer connections simultaneously
- **Buffer Management**: Queues VAAs for delivery to subscribers
- **Zero Relayer Changes**: Works with unmodified relayer code

## Endpoints

### HTTP API (Port 8081)

**POST /submit-vaa**
```json
{
  "vaaBytes": "hex-encoded-vaa-string"
}
```

Response:
```json
{
  "success": true,
  "message": "VAA submitted successfully"
}
```

**GET /health**
Returns service health status.

### gRPC API (Port 7073)

Implements `spy.v1.SpyRPCService/SubscribeSignedVAA` from the Wormhole proto specification.

## Usage

### With Docker Compose

```bash
docker-compose --profile sandbox up -d mock-spy
```

### Standalone

```bash
go run main.go
```

### Environment Variables

- `LOG_LEVEL`: Logging level (debug, info, warn) - default: info
- `GRPC_PORT`: gRPC server port - default: 7073
- `HTTP_PORT`: HTTP server port - default: 8081

## Example: Submitting a VAA

### From TypeScript/Node.js

```typescript
import { MockGuardians, MockEmitter } from '@certusone/wormhole-sdk';

// Create a mock emitter
const emitter = new MockEmitter(
  "0x1234...", // emitter address
  56,          // chain ID
  0            // sequence
);

// Publish a message
const published = emitter.publishMessage(
  1,           // nonce
  payload,     // your payload
  1            // consistency level
);

// Sign with mock guardians
const guardians = new MockGuardians(0, [GUARDIAN_PRIVATE_KEY]);
const signedVAA = guardians.addSignatures(published, [0]);

// Submit to mock spy
await fetch('http://localhost:8081/submit-vaa', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    vaaBytes: signedVAA.toString('hex')
  })
});
```

### From curl

```bash
curl -X POST http://localhost:8081/submit-vaa \
  -H "Content-Type: application/json" \
  -d '{"vaaBytes": "01000000..."}'
```

## Development Workflow

1. Start your local chains (anvil, aztec-sandbox)
2. Start mock-spy service
3. Start relayer (connects to mock-spy:7073)
4. In your tests/API:
   - Create transactions on your local chain
   - Use MockGuardians to sign VAAs
   - POST to mock-spy
   - Relayer automatically processes them

## Migration to Testnet

When ready for testnet, simply:
1. Stop mock-spy service
2. Start real Wormhole spy pointing to testnet
3. Update relayer `SPY_RPC_HOST` to point to real spy
4. No code changes needed!

## Logging

Set `LOG_LEVEL=debug` to see detailed VAA processing:
- VAA submissions via HTTP
- Subscriber connections/disconnections
- VAA broadcasting to relayers

## Architecture Notes

The mock spy maintains a list of active gRPC subscribers (relayers). When a VAA is submitted via HTTP:
1. VAA is decoded and validated
2. Broadcasted to all active subscribers
3. Each subscriber receives the VAA on their gRPC stream
4. Relayer processes it using normal flow

This design ensures the relayer code remains unchanged and tests the real production architecture.
