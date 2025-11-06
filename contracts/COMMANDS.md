# Quick Command Reference

## Building & Testing

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

## Deployment

### Testnets
```bash
npm run deploy:sepolia          # Deploy to Sepolia
npm run deploy:base-sepolia     # Deploy to Base Sepolia
npm run deploy:op-sepolia       # Deploy to OP Sepolia
npm run deploy:anvil            # Deploy to local Anvil
```

### Mainnets
Removed: only testnets supported (Sepolia, Base Sepolia, OP Sepolia) plus Anvil.

### Deploy with Verification
```bash
npm run deploy sepolia -- --verify
```

## Contract Verification

```bash
npm run verify <network> <contractAddress>

# Examples:
npm run verify sepolia 0x1234...
npm run verify baseSepolia 0x1234...
npm run verify opSepolia 0x1234...
```

## Proof Submission

```bash
npm run submit-proof <network> <proofFile> [contractAddress]

# Examples:
npm run submit-proof sepolia ./proof.json
npm run submit-proof baseSepolia ./proof.json 0x1234...
npm run submit-proof opSepolia ./proof.json
```

## Tips

- All commands require proper `.env` configuration
- Deployment info is automatically saved to `deployments/<network>.json`
- Contract addresses from deployments are used automatically for proof submission
