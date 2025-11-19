# GitHub Contribution Verifier - Smart Contracts

> IMPORTANT: Testnets only. Mainnet deployments are not supported in this project.

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
   - `ZK_PROVER_GUEST_ID` - Guest ID from the ZK Prover server (fetch via: `curl {ZK_PROVER_API_URL}/guest-id`)
   - `NOTARY_KEY_FINGERPRINT` - From vlayer's Web Prover
   - `QUERIES_HASH` - Hash of your extraction queries
   - `EXPECTED_URL` - GitHub API URL pattern
   - RPC URLs for your target networks
   - API keys for contract verification

Note: To fetch `ZK_PROVER_GUEST_ID` automatically:
```bash
export ZK_PROVER_API_URL=https://zk-prover.vlayer.xyz/api/v0
export ZK_PROVER_GUEST_ID=$(curl -s ${ZK_PROVER_API_URL}/guest-id | jq -r '.data.guestId')
```

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
  "zkProof": "0xffffffff...",
  "journalDataAbi": "0xa7e62d7f17aa7a22c26bdb93b7ce9400e826ffb2c6f54e54d2ded015677499af..."
}
```

The `journalDataAbi` is ABI-encoded data containing:
- `notaryKeyFingerprint` (bytes32)
- `method` (string) - e.g., "POST"
- `url` (string) - e.g., "https://api.github.com/graphql"
- `tlsTimestamp` (uint256)
- `extractionHash` (bytes32) - corresponds to QUERIES_HASH
- `repo` (string) - repository name with owner
- `username` (string) - GitHub username
- `contributions` (uint256) - number of contributions

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

**Problem**: `ZK_PROVER_GUEST_ID not set`
**Solution**: Fetch the guest ID from your ZK prover server endpoint: `curl {ZK_PROVER_API_URL}/guest-id`, then set `export ZK_PROVER_GUEST_ID={guestId}`.

**Problem**: `Contract not compiled`
**Solution**: Run `npm run build` before deploying

**Problem**: `Deployer has no funds`
**Solution**: Add funds to your deployer wallet

### Submission Issues

**Problem**: `InvalidNotaryKeyFingerprint()`
**Solution**: Verify your proof was generated with the correct notary. The notary fingerprint must match the first field in the decoded `journalDataAbi`.

**Problem**: `InvalidQueriesHash()`
**Solution**: The `extractionHash` field in the decoded `journalDataAbi` must match the contract's `QUERIES_HASH`.

**Problem**: `ZKProofVerificationFailed()`
**Solution**: Ensure your ZK proof data is correctly formatted and valid. The `zkProof` must be a valid RISC Zero proof.

**Problem**: `InvalidUrl()`
**Solution**: The `url` field in the decoded `journalDataAbi` must match the contract's expected URL pattern (e.g., "https://api.github.com/graphql").

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
