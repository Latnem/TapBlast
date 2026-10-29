/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const mock = (name: string) => fileURLToPath(new URL(`./e2e/mock-firebase/${name}.ts`, import.meta.url));

// `--mode e2e` swaps Firebase for an in-browser fake so the whole game can be
// played in automated tests without touching the real database.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  build: {
    // Firebase is most of the bundle; it's cached after the first visit.
    chunkSizeWarningLimit: 700,
  },
  resolve: {
    alias: (mode === 'e2e'
      ? {
          'firebase/app': mock('app'),
          'firebase/auth': mock('auth'),
          'firebase/database': mock('database'),
        }
      : {}) as Record<string, string>,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
}));
