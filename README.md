# Aztec-Wormhole-ZkPassport Demo

A **Verified Donation Platform** demonstrating the integration of zero-knowledge identity proofs with secure cross-chain transfers.

This monorepo combines:
- **ZKPassport SDK** for privacy-preserving identity verification
- **Aztec Network** for private smart contract execution
- **Wormhole** for secure cross-chain messaging
- **Arbitrum** for EVM compatibility

## 🏗️ Architecture

The application enables users to make donations with verified identity proofs (age, citizenship, etc.) without revealing personal information. The donation flow involves:

1. **Identity Verification**: Users prove their identity using ZKPassport (passport/ID verification)
2. **Zero-Knowledge Proofs**: Generate cryptographic proofs without revealing personal data
3. **Cross-Chain Transfer**: Bridge tokens from Arbitrum to Aztec using Wormhole
4. **Private Execution**: Process donations on Aztec with full privacy

## 📦 Monorepo Structure

This project uses **Turborepo** for efficient monorepo management:

```
aztec-wormhole-app-demo/
├── packages/
│   ├── frontend/                    # Next.js web application
│   │   └── app/
│   │       ├── artifacts/           # Compiled Aztec contract artifacts (auto-generated)
│   │       ├── scripts/             # Contract deployment & interaction scripts
│   │       └── assets/              # Contract addresses & configuration
│   ├── aztec-contracts/             # Noir smart contracts for Aztec
│   │   ├── emitter/                 # ZKPassport credential emitter contract
│   │   ├── wormhole/                # Wormhole protocol implementation
│   │   └── wormhole-source/         # Git submodule (NethermindEth/wormhole)
│   ├── evm-contracts/               # Solidity contracts (Foundry)
│   │   ├── src/                     # Contract sources (Vault, Donation, BridgeToken)
│   │   └── script/                  # Deployment scripts
│   └── relayer/                     # Go-based bidirectional Aztec-Arbitrum relayer
├── package.json                     # Root workspace configuration
└── turbo.json                       # Turborepo configuration
```

## 🚀 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version `>=20.9.0` (required by Next.js 16)
  ```bash
  # Check your Node version
  node --version
  
  # Using nvm (recommended)
  nvm install 20
  nvm use 20
  ```

- **npm**: Version `>=10.0.0` (comes with Node.js 20+)

- **Aztec Nargo**: For compiling Aztec contracts (optional if using pre-built artifacts)
  ```bash
  # Install Aztec
  bash -i <(curl -s https://install.aztec.network)
  ```
  See [Aztec Installation Guide](https://docs.aztec.network/getting-started) for details.

- **Go**: For running the relayer (optional if you only want to run the frontend)

- **Foundry**: For EVM contract development (optional)

## 📥 Installation

1. **Clone the repository with submodules**
   ```bash
   git clone --recurse-submodules <repository-url>
   cd aztec-wormhole-app-demo
   ```

   **Already cloned without submodules?** Initialize them:
   ```bash
   git submodule update --init --recursive
   ```

   > **Note:** This project uses Git submodules for Wormhole protocol implementations:
   > - `packages/evm-contracts/lib/wormhole` - For Solidity contract dependencies
   > - `packages/aztec-contracts/wormhole-source` - For Aztec/Noir contract sources (aztec branch)
   >
   > The `--recurse-submodules` flag ensures all dependencies are properly initialized.

2. **Install dependencies**
   ```bash
   npm install
   ```

   This will install dependencies for all packages in the monorepo.

## 🛠️ Local Development (Sandbox)

### 1. Start the Sandbox

Start the local Aztec sandbox with a forked Anvil node:

```bash
# From project root
docker compose up
```

This starts:
- **Anvil** on `localhost:8545` (forked from Arbitrum Sepolia)
- **Aztec Node** on `localhost:8080`

### 2. Configure Environment

```bash
cd packages/aztec
cp .example.env .env
```

Edit `.env` for sandbox:
```env
L1_RPC_URL=http://localhost:8545
L2_NODE_URL=http://localhost:8080
```

### 3. Compile & Deploy Aztec Contracts

```bash
cd packages/aztec

# Install dependencies
bun install

# Compile Noir contracts to TypeScript artifacts
bun run build:contracts

# Set up accounts (creates wallets)
bun run setup:accounts

# Deploy Token, Wormhole, and TokenBridge contracts
bun run setup:deploy
```

### 4. Compile & Deploy EVM Contracts

```bash
cd packages/evm

# Install forge dependencies and build
bun run build

# Run tests
bun run test
```

## 🚀 Testnet Deployment

### Aztec Testnet (Devnet)

```bash
cd packages/aztec
cp .example.env .env
```

Edit `.env` for testnet:
```env
L1_RPC_URL=https://eth-sepolia.public.blastapi.io
L2_NODE_URL=https://devnet.aztec-labs.com
```

Deploy:
```bash
bun run build:contracts
bun run setup:accounts
bun run setup:deploy
```

### EVM (Arbitrum Sepolia)

```bash
cd packages/evm
cp env.example .env
```

Edit root `.env` with your private key:
```env
PRIVATE_KEY=0x...your_private_key...
```

Deploy:
```bash
source .env
forge script script/DeployTokenBridge.s.sol \
  --rpc-url arbitrum_sepolia \
  --broadcast
```

### Configure Both Bridges

After deploying both sides, configure the bridges to trust each other:

```bash
cd packages/aztec
bun run setup:configure
```

This will register emitters on both Aztec and EVM sides automatically.

Optional environment overrides:
```env
WORMHOLE_ADDRESS=0x...          # Override Wormhole Core address
WORMHOLE_CHAIN_ID=10003         # Wormhole chain ID
AZTEC_EMITTER_ADDRESS=0x...     # Aztec bridge address to register
DEPLOY_TEST_TOKEN=true          # Deploy a test BridgedToken
```

### Post-Deployment Configuration

After deploying both bridges, run the configure script to register emitters on both sides:

```bash
cd packages/aztec

# This registers:
# - EVM bridge as trusted emitter on Aztec
# - Aztec bridge as trusted emitter on EVM
# - Sets up remote token mappings (if EVM_TOKEN_ADDRESS is set)
bun run setup:configure
```

The configure script reads addresses from the root `.env` file (auto-populated by deploy scripts) and:
1. Registers the EVM TokenBridge as a trusted emitter on Aztec (chain ID 10003)
2. Registers the Aztec TokenBridge as a trusted emitter on EVM (chain ID 56)
3. Optionally sets up remote token mappings if `EVM_TOKEN_ADDRESS` is configured

**Manual configuration (if needed):**
```typescript
// On Aztec side
await registerEmitter(wallet, from, bridgeContract, 10003, evmBridgeAddressBytes, opts);
await setRemoteToken(wallet, from, bridge, localToken, 10003, evmTokenBytes, true, opts);

// On EVM side (via cast or contract call)
cast send $EVM_BRIDGE "registerEmitter(uint16,bytes32)" 56 $AZTEC_BRIDGE_BYTES32
bridge.setRemoteToken(localToken, 56, aztecTokenBytes, true);
```

## 📋 Contract Addresses

### Aztec Testnet (Official Wormhole Deployment)
| Contract | Address |
|----------|---------|
| Wormhole | `0x2b13cff4daef709134419f1506ccae28956e02102a5ef5f2d0077e4991a9f493` |
| Token | `0x063cb1ad6d818724574328352263cbc8ae38c8c3d5b1ae3e0c0dcc1e58d772ac` |
| TokenBridge | `0x12216055e8771f01db45d2b0282ae81298a2c0d1125e76da42aff0fa228fc642` |

### Arbitrum Sepolia
| Contract | Address |
|----------|---------|
| Wormhole Core | `0x6b9C8671cdDC8dEab9c719bB87cBd3e782bA6a35` |
| TokenBridge | `0xf35a71868f2c6649277bcb8993eb0338484deef8` |

### Chain IDs
| Chain | Wormhole Chain ID |
|-------|-------------------|
| Aztec | 56 |
| Arbitrum Sepolia | 10003 |

## 🔧 Available Scripts

### Aztec Package (`packages/aztec`)

| Script | Description |
|--------|-------------|
| `bun run build:contracts` | Compile Noir contracts to TypeScript |
| `bun run build:ts` | Build TypeScript library |
| `bun run build` | Full build (contracts + TypeScript) |
| `bun run setup:accounts` | Create wallet accounts |
| `bun run setup:deploy` | Deploy all contracts (updates root .env) |
| `bun run setup:configure` | Register emitters on both Aztec and EVM |
| `bun run mint` | Mint tokens |
| `bun run bridge:out` | Bridge tokens to EVM |

### EVM Package (`packages/evm`)

| Script | Description |
|--------|-------------|
| `bun run build` | Install deps + compile contracts |
| `bun run test` | Run forge tests |
| `bun run lint` | Check formatting |
| `bun run clean` | Clean build artifacts |

## 📚 Package Details

### Frontend (`packages/frontend`)

**Technology Stack:**
- **Next.js 16** (React 19) with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Aztec.js 2.0.3** for Aztec network interaction
- **ZKPassport SDK 0.10.0** for identity verification

**Key Dependencies:**
```json
{
  "@aztec/accounts": "2.0.3",
  "@aztec/aztec.js": "2.0.3",
  "@aztec/noir-contracts.js": "2.0.3",
  "@zkpassport/sdk": "0.10.0",
  "@zkpassport/utils": "0.25.3"
}
```

**Features:**
- QR code generation for mobile identity verification
- Real-time proof generation status
- Cross-chain donation tracking
- Beautiful, responsive UI

**Scripts:**
- `npm run dev` - Start development server
- `npm run build` - Create production build
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Aztec Contracts (`packages/aztec-contracts/`)

**Technology Stack:**
- **Noir** programming language
- **Aztec Nargo** compiler
- **Aztec SDK** for contract deployment

This package contains two Noir smart contracts for the Aztec network:

#### 1. Emitter Contract (`packages/aztec-contracts/emitter`)
The `ZKPassportCredentialEmitter` contract for managing verified credentials on Aztec.

#### 2. Wormhole Contract (`packages/aztec-contracts/wormhole`)
The Aztec implementation of the Wormhole protocol for cross-chain messaging. Sources are symlinked from the `wormhole-source` git submodule (NethermindEth/wormhole, aztec branch).

#### Artifact Generation

Both contracts follow the same build pipeline:

1. **Compilation**: Contracts are compiled using `aztec-nargo compile`
2. **Artifact Output**: Compiled JSON artifacts are generated in each contract's `target/` directory
3. **Auto-Copy**: A post-build script automatically copies artifacts to `packages/frontend/app/artifacts/`

**Build Process:**

```bash
# Build all Aztec contracts (via Turborepo)
npm run build

# Or build individually
cd packages/aztec-contracts/emitter
npm run build  # Compiles and copies emitter-ZKPassportCredentialEmitter.json

cd packages/aztec-contracts/wormhole
npm run build  # Compiles and copies wormhole_contracts-Wormhole.json
```

**Generated Artifacts:**
- `packages/frontend/app/artifacts/emitter-ZKPassportCredentialEmitter.json`
- `packages/frontend/app/artifacts/wormhole_contracts-Wormhole.json`

These artifacts are imported by the frontend scripts (`deploy.mjs`, `send-message.mjs`) for contract interaction.

**Note:** The artifacts are auto-generated and should not be manually edited. To update them, modify the Noir source code and rebuild.

### EVM Contracts (`packages/evm-contracts`)

**Technology Stack:**
- **Solidity** smart contracts
- **Foundry** for development and testing
- **OpenZeppelin** contracts for security

**Contracts:**
- `Vault.sol` - Main vault contract for cross-chain operations
- `Donation.sol` - Donation handling logic
- `BridgeToken.sol` - Token bridging functionality

**Scripts:**
- Deploy script using Foundry in `script/DeployVault.s.sol`

### Relayer (`packages/relayer`)

**Technology Stack:**
- **Go** for high-performance message relaying
- Connects to Aztec PXE and Arbitrum RPC
- Monitors Wormhole spy service

Handles bidirectional message passing between Aztec and Arbitrum networks.

**Commands:**
- `evm` - Relay VAAs from Aztec (chain 56) to EVM chains
- `aztec` - Relay VAAs from EVM chains (chain 10003) to Aztec

**Running Locally:**
```bash
cd packages/relayer

# Build
go build -o wormhole-relayer .

# Run Aztec -> EVM relay
./wormhole-relayer evm --private-key $PRIVATE_KEY

# Run EVM -> Aztec relay
./wormhole-relayer aztec
```

**Running with Docker:**
```bash
# Start all services (spy + both relayers)
docker compose up -d

# View logs
docker compose logs -f relayer-to-evm
docker compose logs -f relayer-to-aztec
```

**Environment Variables:**
| Variable | Description | Default |
|----------|-------------|---------|
| `SPY_RPC_HOST` | Wormhole spy service | `localhost:7073` |
| `CHAIN_ID` | Source chain to filter | `56` (Aztec) or `10003` (Arb) |
| `EVM_RPC_URL` | Arbitrum RPC endpoint | `https://sepolia-rollup.arbitrum.io/rpc` |
| `EVM_TARGET_CONTRACT` | TokenBridge on EVM | - |
| `PRIVATE_KEY` | EVM wallet private key | - |
| `AZTEC_PXE_URL` | Aztec PXE endpoint | `https://devnet.aztec-labs.com/` |
| `AZTEC_TARGET_CONTRACT` | TokenBridge on Aztec | - |
| `AZTEC_WALLET_ADDRESS` | Aztec wallet address | - |

## 🔧 Configuration

### Environment Variables

Copy the example environment file and configure:

```bash
cp env.example .env
```

Key environment variables (see `env.example` for full list):
- Aztec network configuration
- Arbitrum RPC endpoints
- Contract addresses
- Wormhole settings

### Frontend Configuration

The frontend may require additional configuration in `packages/frontend`:
- Aztec PXE endpoint
- ZKPassport service configuration
- API endpoints

## 🧪 Testing

The application has been tested with:
- ✅ TypeScript compilation
- ✅ ESLint validation
- ✅ Production build generation
- ✅ Runtime functionality (form validation, UI rendering)

## 📖 Additional Resources

- [Aztec Documentation](https://docs.aztec.network/)
- [ZKPassport Documentation](https://zkpassport.id/)
- [Wormhole Documentation](https://docs.wormhole.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Turborepo Documentation](https://turbo.build/repo/docs)

## 🐛 Troubleshooting

### Missing Submodules Error

**Error:** `Cannot find module 'wormhole/ethereum/contracts/...'` or compilation failures in contracts

**Cause:** Wormhole submodules weren't initialized during clone.

**Solution:**
```bash
git submodule update --init --recursive
```

**For EVM contracts**, rebuild after initializing submodules:
```bash
cd packages/evm-contracts
forge build
```

**For Aztec contracts**, the Wormhole contract sources are symlinked from the `wormhole-source` submodule. If you see broken symlinks or compilation errors:
```bash
# Ensure submodules are initialized
git submodule update --init --recursive

# Rebuild Aztec contracts
cd packages/aztec-contracts/wormhole
npm run build
```

### Node.js Version Error

**Error:** `You are using Node.js X.X.X. For Next.js, Node.js version ">=20.9.0" is required.`

**Solution:** Upgrade to Node.js 20 or higher:
```bash
nvm install 20
nvm use 20
```

### Multiple Lockfiles Warning

**Warning:** Next.js detects multiple `package-lock.json` files

**Solution:** This is expected in a monorepo. You can ignore this warning or configure `turbopack.root` in `next.config.ts`.

### Port Already in Use

**Error:** Port 3000 is already in use

**Solution:** Kill the existing process or use a different port:
```bash
# Kill process on port 3000
pkill -f "next dev"

# Or start on a different port
PORT=3001 npm run dev
```

## 🤝 Contributing

This is a demo application showcasing the integration of multiple Web3 technologies. For contributions or questions, please refer to the individual package documentation.

## 📄 License

See [LICENSE](LICENSE) file for details.
