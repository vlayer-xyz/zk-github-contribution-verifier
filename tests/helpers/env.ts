import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

export const projectRoot = path.resolve(__dirname, '../..');
export const contractsDir = path.join(projectRoot, 'contracts');
const envTestPath = path.join(projectRoot, '.env.test');

export function loadTestEnv() {
  if (existsSync(envTestPath)) {
    dotenv.config({ path: envTestPath });
  } else {
    dotenv.config();
  }
}

// Load immediately so other helpers/tests can rely on process.env values.
loadTestEnv();
