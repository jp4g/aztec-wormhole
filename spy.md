# Wormhole Spy & Relayer Architecture Analysis

## The Problem

The relayer in `packages/relayer/relayer.go` ONLY accepts VAAs (Verifiable Action Attestations) from the Wormhole spy service's gRPC stream. There is currently no other input mechanism.

**Current Architecture:**
```
Wormhole Guardian Network → Spy Service (gRPC) → Relayer → Destination Chains
```

**MockGuardians (for testing):**
```
Test Script → MockGuardians.sign() → Signed VAA (but nowhere to send it)
```

The spy service can only connect to real Guardian networks (mainnet/testnet/devnet), making pure local development impossible without either:
1. Running full Wormhole infrastructure (Tilt + Kubernetes - very heavy)
2. Connecting to testnet (requires testnet deployment)
3. Modifying the relayer

## Solution Options

### Option 1: Hybrid Relayer (RECOMMENDED) ✅

Add alternative input modes to the relayer:
- **Spy mode**: Existing gRPC stream from spy service (for testnet/mainnet)
- **HTTP mode**: Accept VAAs via HTTP POST (for local dev with MockGuardians)
- **File mode**: Watch directory for VAA files (optional, for debugging)

**Implementation:**
- Add `--mode` flag: `spy`, `http`, or `file`
- Add HTTP server with `/inject-vaa` endpoint
- Keep ALL VAA processing logic identical
- ~100-150 lines of Go code

**Local Development Flow:**
```typescript
// In test script
const guardians = new MockGuardians(0, [GUARDIAN_KEY]);
const signedVAA = guardians.addSignatures(message, [0]);

// Inject into relayer
await fetch('http://localhost:8081/inject-vaa', {
    method: 'POST',
    body: JSON.stringify({ vaaBytes: signedVAA.toString('hex') })
});
```

**For Testnet:** Just change `RELAYER_INPUT_MODE=spy` in env

**Pros:**
- Works NOW for local dev
- Works LATER for testnet
- Minimal code changes
- Tests real relayer logic
- Clean separation of concerns

**Cons:**
- Requires modifying relayer.go

---

### Option 2: Mock Spy Service

Create a separate Go service that implements the spy's gRPC interface and serves test VAAs.

**Pros:**
- Zero changes to relayer code
- Preserves exact production architecture

**Cons:**
- ~200-300 lines of additional code
- Another service to maintain
- More complex setup

---

### Option 3: Skip Relayer for Local Dev

Use MockGuardians in scripts to manually call verification functions on both chains.

**Pros:**
- No relayer changes needed

**Cons:**
- Doesn't test the real relayer flow
- Manual orchestration required
- Different from production

---

### Option 4: Use Tilt (Full Wormhole Devnet)

Run the complete Wormhole infrastructure locally using Kubernetes.

**Setup:**
```bash
git clone git@github.com:wormhole-foundation/wormhole.git
cd wormhole
./scripts/dev-setup.sh  # Installs minikube, tilt, etc.
tilt up
```

**Pros:**
- Production-like environment
- Real Guardian nodes
- Real spy service

**Cons:**
- Requires Kubernetes (minikube)
- Very resource intensive
- Slow startup
- **Cannot integrate with docker-compose**
- Overkill for simple local testing

---

### Option 5: Connect to Testnet

Skip local development, deploy to testnet immediately.

**Pros:**
- Real production architecture
- No local infrastructure needed

**Cons:**
- Slow iteration cycles
- Costs gas
- Requires testnet deployment first

---

## Final Implementation ✅

We implemented **Option 2: Mock Spy Service** - a clean solution that keeps the relayer completely unchanged.

### Architecture

```
┌─────────────────┐
│ send-message.mjs│
│   (Aztec Tx)    │
└────────┬────────┘
         │ 1. Send transaction
         │ 2. Extract payload
         │ 3. Sign with MockGuardians
         │ 4. HTTP POST
         ▼
┌──────────────────┐
│   Mock Spy       │
│  (Port 8081/7073)│
└────────┬─────────┘
         │ gRPC Stream
         ▼
┌──────────────────┐
│    Relayer       │
│  (Unchanged!)    │
└──────────────────┘
```

### Components

**1. Mock Spy Service** (`packages/mock-spy/`)
- HTTP server (port 8081): Receives signed VAAs from scripts
- gRPC server (port 7073): Implements `SpyRPCService.SubscribeSignedVAA`
- Forwards VAAs from HTTP to gRPC subscribers (relayers)
- Zero relayer modifications needed

**2. Modified send-message.mjs** (`packages/frontend/app/scripts/`)
- After Aztec transaction completes
- Uses `MockGuardians` to sign the payload
- POSTs signed VAA to mock-spy HTTP endpoint
- Mock-spy automatically forwards to relayer

**3. Docker Compose Integration**
- `mock-spy` service runs in sandbox profile
- Relayer connects to `mock-spy:7073` instead of real spy
- For testnet: just uncomment real spy service, comment mock-spy

### Local Development Flow

1. Start services: `docker-compose --profile sandbox up -d`
2. Run `send-message.mjs` script
3. Transaction sent to Aztec → Anvil
4. Script signs payload with MockGuardians
5. Script POSTs to `http://mock-spy:8081/submit-vaa`
6. Mock-spy streams to relayer via gRPC
7. Relayer processes with existing logic (unchanged!)

### Testnet Migration

In `docker-compose.yml`:
```yaml
# Comment out mock-spy
# Uncomment real wormhole-spy service
```

Update relayer env:
```yaml
- SPY_RPC_HOST=wormhole-spy:7073  # real spy
```

**Zero code changes. Zero relayer changes.**

## Key Decisions

1. **Why Mock Spy?** Keeps relayer unchanged, tests real architecture
2. **Why not modify relayer?** Reduces risk, easier to maintain
3. **Why not watch chain?** Unnecessary complexity, script already has the data
4. **Guardian key?** Hardcoded for local dev, would use env var for testnet

## Files Modified/Created

- ✅ `packages/mock-spy/` - New mock spy service (Go)
- ✅ `packages/frontend/app/scripts/send-message.mjs` - Added MockGuardians signing
- ✅ `docker-compose.yml` - Added mock-spy and relayer services
- ✅ `packages/frontend/package.json` - Added wormhole-sdk dependency
