import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import expoConfig from 'eslint-config-expo/flat.js';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      // Gekopieerde bestanden van maplibre-gl (scripts/prepare-web-assets.mjs).
      'apps/mobile/public/**',
      'db/**',
      'tools/**',
      'scripts/points-table.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Expo's regels alleen op de app; de shared package is platformvrij.
    files: ['apps/mobile/**/*.{ts,tsx,js,jsx}'],
    extends: [expoConfig],
    settings: {
      // Expliciet zetten: eslint-plugin-react probeert de React-versie anders
      // zelf te detecteren via een API die ESLint 10 niet meer heeft.
      react: { version: '19.2' },
      // Zonder dit kent de import-plugin de '@/*'-alias uit tsconfig niet.
      'import/resolver': {
        typescript: { project: 'apps/mobile/tsconfig.json' },
      },
    },
  },
  {
    // De e2e-test en de nagemaakte server draaien in Node, niet in de app.
    files: ['apps/mobile/e2e/**/*.mjs', '*.mjs', 'scripts/**/*.{ts,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        // Wordt binnen page.evaluate() in de browser uitgevoerd.
        fetch: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    rules: {
      // Ongebruikte variabelen mogen met _ beginnen (bv. bij event handlers).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
