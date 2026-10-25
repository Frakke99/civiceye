import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Zelfde alias als apps/mobile/tsconfig.json, zodat tests appcode met
    // '@/'-imports (zoals de i18n-laag) kunnen laden.
    alias: { '@': path.resolve(__dirname, 'apps/mobile/src') },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
