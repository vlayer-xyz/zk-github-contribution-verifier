import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
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
