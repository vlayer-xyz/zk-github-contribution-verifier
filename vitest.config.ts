import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode || 'test', process.cwd(), '');
  
  return {
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
      testTimeout: 180_000,
      hookTimeout: 180_000,
      globals: false,
      reporters: 'default',
      env, // Pass loaded env vars to tests
    },
  };
});
