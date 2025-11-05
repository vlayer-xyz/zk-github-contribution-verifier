# GitHub Contribution Verifier - Smart Contracts

Solidity smart contracts for verifying GitHub contributions using zero-knowledge proofs from vlayer.

## Overview

This contract allows users to submit cryptographic proofs of their GitHub contributions and store them on-chain. The proofs are generated using vlayer's Web Prover API and verified on-chain using RISC Zero's verification infrastructure.

## Architecture

- **GitHubContributionVerifier.sol** - Main contract that verifies and stores contribution proofs
- **NetworkConfig.sol** - Helper contract for network-specific configurations
- **Deploy.s.sol** - Foundry deployment script (alternative to JS scripts)
- **deploy.ts** - JavaScript deployment script
- **verify.ts** - JavaScript contract verification script
- **submitProof.ts** - Script to submit ZK proofs to deployed contracts

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js 18+ (for deployment and interaction scripts)
- A wallet with funds on your target network

## Installation

```bash
# Install Foundry dependencies
forge install

# Install Node.js dependencies
npm install
```

## Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Fill in the required values:
   - `PRIVATE_KEY` - Your wallet's private key (without 0x prefix)
   - `NOTARY_KEY_FINGERPRINT` - From vlayer's Web Prover
   - `QUERIES_HASH` - Hash of your extraction queries
   - `EXPECTED_URL` - GitHub API URL pattern
   - RPC URLs for your target networks
   - API keys for contract verification

## Available Commands

### Building and Testing

```bash
# Build contracts
npm run build

# Clean build artifacts
npm run clean

# Run all tests
npm run test

# Run tests with verbose output
npm run test:verbose

# Run tests with gas report
npm run test:gas
```

### Deployment

#### Supported Networks

- Sepolia (testnet)
- Base Sepolia (testnet)
- OP Sepolia (testnet)
- Anvil (local)

#### Deploy to Testnet

```bash
# Deploy to Sepolia
npm run deploy:sepolia

# Deploy to Base Sepolia
npm run deploy:base-sepolia

# Deploy to OP Sepolia
npm run deploy:op-sepolia

# Only these testnets are supported
```

#### Deploy to Mainnet

Mainnet deployments are not supported in this project configuration.

#### Deploy to Local Anvil

```bash
# Start Anvil in a separate terminal
anvil

# Deploy to local network
npm run deploy:anvil
```

#### Deploy with Auto-Verification

```bash
# Deploy and verify in one step
npm run deploy sepolia -- --verify
```

### Contract Verification

If auto-verification fails during deployment, you can manually verify:

```bash
# Verify on Sepolia
npm run verify sepolia 0xYourContractAddress

# Verify on Base Sepolia
npm run verify baseSepolia 0xYourContractAddress

# Verify on OP Sepolia
npm run verify opSepolia 0xYourContractAddress
```

## Submitting Proofs

After deployment, you can submit ZK proofs using the TypeScript script:

### 1. Prepare ZK Proof Data

Create a JSON file with your ZK proof data (from `/api/compress` endpoint):

```json
{
  "zkProof": "0x...",
  "publicOutputs": {
    "notaryKeyFingerprint": "0x...",
    "method": "GET",
    "url": "https://api.github.com/repos/vlayer-xyz/vlayer/contributors",
    "timestamp": 1762169987,
    "queriesHash": "0x...",
    "values": ["username", 286]
  }
}
```

### 2. Submit to Contract

```bash
# Submit to Sepolia
npm run submit-proof sepolia ./proof.json

# Submit to Base Sepolia with custom contract address
npm run submit-proof baseSepolia ./proof.json 0x1234...

# Submit to OP Sepolia
npm run submit-proof opSepolia ./proof.json
```

## Contract Interaction

### Read Functions

```solidity
// Get latest contribution for a user
function getLatestContribution(string memory username)
    returns (ContributionRecord memory)

// Get all contribution history for a user
function getContributionHistory(string memory username)
    returns (ContributionRecord[] memory)

// Get number of contribution records for a user
function getContributionCount(string memory username)
    returns (uint256)

// Get total verified contributions across all users
function totalVerifiedContributions() returns (uint256)
```

### Write Functions

```solidity
// Submit a new contribution proof
function submitContribution(
    bytes calldata journalData,
    bytes calldata seal
) external
```

## Development

### Project Structure

```
contracts/
├── src/
│   └── GitHubContributionVerifier.sol    # Main contract
├── script/
│   ├── Deploy.s.sol                       # Foundry deploy script
│   └── NetworkConfig.sol                  # Network configurations
├── scripts/
│   ├── deploy.ts                          # JS deployment script
│   ├── verify.ts                          # JS verification script
│   ├── submitProof.ts                     # JS proof submission
│   └── config.ts                          # Network config
├── test/
│   └── GitHubContributionVerifier.t.sol   # Test suite
├── deployments/                           # Deployment artifacts
├── .env.example                           # Environment template
└── package.json                           # NPM scripts
```

### Deployment Workflow

1. **Build contracts**: `npm run build`
2. **Run tests**: `npm run test`
3. **Deploy to testnet**: `npm run deploy:sepolia`
4. **Verify contract**: Automatic with `--verify` flag or manual with `npm run verify`
5. **Update .env**: Add deployed contract address
6. **Submit proof**: `npm run submit-proof sepolia ./proof.json`

## Security Considerations

1. **Private Keys**: Never commit `.env` files or expose private keys
2. **Notary Fingerprint**: Ensure the notary fingerprint matches vlayer's official notary
3. **Queries Hash**: Validate that the queries hash matches your expected extraction queries
4. **URL Pattern**: The contract validates that proofs come from GitHub API URLs
5. **Proof Verification**: All proofs are verified using RISC Zero's verifier before storage

## Troubleshooting

### Deployment Issues

**Problem**: `NOTARY_KEY_FINGERPRINT not set`
**Solution**: Set the required environment variables in `.env`

**Problem**: `Contract not compiled`
**Solution**: Run `npm run build` before deploying

**Problem**: `Deployer has no funds`
**Solution**: Add funds to your deployer wallet

### Submission Issues

**Problem**: `InvalidNotaryKeyFingerprint()`
**Solution**: Verify your proof was generated with the correct notary

**Problem**: `ZKProofVerificationFailed()`
**Solution**: Ensure your ZK proof data is correctly formatted and valid

**Problem**: `InvalidUrl()`
**Solution**: The proof must be for a GitHub API URL

## Network-Specific Information

### RISC Zero Verifier Addresses

Update the verifier addresses in your `.env` file for each supported network:

```bash
SEPOLIA_VERIFIER_ADDRESS=0x...
BASE_SEPOLIA_VERIFIER_ADDRESS=0x...
OP_SEPOLIA_VERIFIER_ADDRESS=0x...
```

These addresses can be found in the [RISC Zero documentation](https://dev.risczero.com/).

### Gas Costs

Approximate gas costs for `submitContribution` depend on the L2 testnet used (OP Sepolia/Base Sepolia) and current network conditions.

## License

MIT

## Resources

- [vlayer Documentation](https://docs.vlayer.xyz/)
- [RISC Zero Documentation](https://dev.risczero.com/)
- [Foundry Book](https://book.getfoundry.sh/)
- [Viem Documentation](https://viem.sh/)
