import { requireEnv } from './app/lib/env';

export function register() {
  requireEnv('VLAYER_API_GATEWAY_KEY');
  requireEnv('WEB_PROVER_API_URL');
  requireEnv('ZK_PROVER_API_URL');
}
