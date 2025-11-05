import * as dotenv from 'dotenv';
import path from 'path';
import { deploy } from './deploy';
import { submitProof, type ZKProofData } from './submitProof';

dotenv.config();

async function main() {
  const network = 'anvil';

  // Ensure required env vars exist for local testing; provide sensible defaults if missing
  if (!process.env.PRIVATE_KEY) {
    console.error('PRIVATE_KEY is not set. Set it to one of your Anvil accounts (shown when you run anvil).');
    process.exit(1);
  }

  if (!process.env.NOTARY_KEY_FINGERPRINT) {
    // 32-byte non-zero hex for local testing
    process.env.NOTARY_KEY_FINGERPRINT = '0x1111111111111111111111111111111111111111111111111111111111111111';
  }

  if (!process.env.QUERIES_HASH) {
    // 32-byte non-zero hex for local testing
    process.env.QUERIES_HASH = '0x2222222222222222222222222222222222222222222222222222222222222222';
  }

  if (!process.env.EXPECTED_URL) {
    process.env.EXPECTED_URL = 'https://api.github.com';
  }

  console.log(`\n=== Preparing local (Anvil) environment ===\n`);

  // 1) Deploy
  const { address: contractAddress } = await deploy({ network });

  // 2) Build a dummy ZK proof payload for local testing
  const username = 'alice';
  const contributions = 42;
  const repoUrl = 'https://github.com/alice/demo-repo';
  const now = Math.floor(Date.now() / 1000);

  const zkProofData: ZKProofData = {
    zkProof: '0x1234', // arbitrary bytes for local testing
    publicOutputs: {
      notaryKeyFingerprint: process.env.NOTARY_KEY_FINGERPRINT as `0x${string}`,
      method: 'GET',
      url: repoUrl,
      timestamp: now,
      queriesHash: process.env.QUERIES_HASH as `0x${string}`,
      values: [username, contributions],
    },
  };

  // 3) Submit proof
  await submitProof({ network, zkProofData, contractAddress });

  console.log(`\n=== Local prepare complete ===`);
  console.log(`Contract deployed at: ${contractAddress}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}


