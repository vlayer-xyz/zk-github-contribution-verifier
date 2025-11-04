#!/usr/bin/env node

/*
  Submit a saved Web Prover presentation JSON to the zk-prover compress endpoint
  (same endpoint used by Next.js /api/compress) and save the resulting zk proof.

  Usage:
    node extract-zk-from-web-proof.js [PATH_TO_PRESENTATION_JSON] [--username GITHUB_USERNAME]

  Env vars (loaded via dotenv):
    WEB_PROVER_API_CLIENT_ID, WEB_PROVER_API_SECRET
*/

const fs = require('fs');
const path = require('path');

// Load env variables from .env.local (if present) then .env
try {
  const dotenv = require('dotenv');
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
  }
  dotenv.config();
} catch (e) {
  // dotenv is optional; proceed if not installed
}

const COMPRESS_URL = 'https://zk-prover.vlayer.xyz/api/v0/compress-web-proof';

function nowTs() {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function listCandidates(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.match(/^proof_response_(nextjs|direct)_\d{8}_\d{6}\.json$/))
      .map((f) => ({ file: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
      .map((x) => x.file);
  } catch {
    return [];
  }
}

function findLatestProofFile() {
  const here = listCandidates(process.cwd());
  if (here.length > 0) return path.resolve(process.cwd(), here[0]);
  const parent = path.resolve(process.cwd(), '..');
  const up = listCandidates(parent);
  if (up.length > 0) return path.join(parent, up[0]);
  return null;
}

function parseArgs(argv) {
  const args = { input: '', username: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--username') {
      args.username = argv[i + 1] || '';
      i++;
    } else if (!args.input) {
      args.input = a;
    }
  }
  return args;
}

async function main() {
  console.log('Submitting saved web proof to compress endpoint...');
  console.log('');

  const clientId = process.env.WEB_PROVER_API_CLIENT_ID;
  const secret = process.env.WEB_PROVER_API_SECRET;
  if (!clientId || !secret) {
    console.error('Error: WEB_PROVER_API_CLIENT_ID and WEB_PROVER_API_SECRET must be set');
    process.exit(1);
  }

  const { input, username } = parseArgs(process.argv);
  let inputFile = input;
  if (!inputFile) {
    const latest = findLatestProofFile();
    if (!latest) {
      console.error('Error: No saved web proof JSON found.');
      console.error('Run one of these first:');
      console.error('  ./test-nextjs-api.sh');
      console.error('  ./test-direct-api.sh');
      process.exit(1);
    }
    inputFile = latest;
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  console.log('Input file:', inputFile);
  if (username) console.log('Username (for extract):', username);

  const presentation = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

  const body = username
    ? {
        presentation,
        extract: {
          'response.body': {
            jmespath: [
              `[?login=='${username}'].login | [0]`,
              `[?login=='${username}'].contributions | [0]`,
            ],
          },
        },
      }
    : { presentation };

  const requestPreview = JSON.stringify(body);
  console.log('==========================================');
  console.log('Curl Command (copy to share):');
  console.log('==========================================');
  console.log(
    [
      'curl -X POST',
      COMPRESS_URL,
      '-H "Content-Type: application/json"',
      `-H "x-client-id: ${clientId}"`,
      `-H "Authorization: Bearer ${secret}"`,
      `-d '${requestPreview.replace(/'/g, "'\\''")}'`,
    ].join(' \\\n  ')
  );
  console.log('');
  console.log('==========================================');
  console.log('');

  console.log('Starting request at:', new Date().toISOString().replace('T', ' ').slice(0, 19));
  console.log('');

  const start = Date.now();

  const res = await fetch(COMPRESS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': clientId,
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });

  const end = Date.now();
  const durationSec = Math.round((end - start) / 1000);

  const text = await res.text();
  const status = res.status;

  console.log('Completed at:', new Date().toISOString().replace('T', ' ').slice(0, 19));
  console.log('');
  console.log('==========================================');
  console.log('Results:');
  console.log('==========================================');
  console.log('HTTP Status Code:', status);
  console.log(`Duration: ${durationSec} seconds (${Math.floor(durationSec / 60)}m ${durationSec % 60}s)`);
  console.log('');

  const outFile = path.resolve(process.cwd(), `zk_proof_compress_${nowTs()}.json`);

  if (res.ok) {
    console.log('✓ Success! ZK proof generated from web presentation.');
    console.log('');
    console.log(text.slice(0, 500));
    console.log('\n...');
    fs.writeFileSync(outFile, text, 'utf-8');
    console.log('Full response saved to:', outFile);
  } else {
    console.log('✗ Error occurred');
    console.log('');
    console.log('Response:');
    console.log(text);
    fs.writeFileSync(outFile, text, 'utf-8');
    console.log('Error response saved to:', outFile);
    process.exitCode = 1;
  }

  console.log('');
  console.log('==========================================');
}

// Ensure fetch exists on Node <=18 environments
if (typeof fetch === 'undefined') {
  global.fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
}

main().catch((err) => {
  console.error('Unexpected error:', err?.message || err);
  process.exit(1);
});


