import js from '@eslint/js';
import eslintPluginImport from 'eslint-plugin-import';

/**
 * Root ESLint flat config for the monorepo.
 * - Minimal, no extra plugins (works with Node + React JSX via Espree)
 * - Per-package environment tweaks
 */
export default [
  // Ignore heavy/generated paths
  {
    ignores: [
      'node_modules/',
      '**/node_modules/',
      'dist/',
      '**/dist/',
      'build/',
      '**/build/',
      'out/',
      '**/out/',
      'coverage/',
      '**/coverage/',
      'apps/nap-serv/html/**',
      'apps/nap-serv/logs/**',
      'apps/nap-serv/coverage/**',
      '.nyc_output/',
      'playwright-report/',
      '**/playwright-report/',
      'test-results/',
      '**/test-results/',
      'cypress/',
      '**/cypress/',
      '.cache/',
      '**/.cache/',
      '.vite/',
      '**/.vite/',
      '.turbo/',
      '**/.turbo/',
      '.rollup.cache',
      '**/.rollup.cache',
      '.next/',
      '.nuxt/',
      'storybook-static/',
      '**/storybook-static/',
      'docs/',
      '**/docs/',
      '*.tsbuildinfo',
      '**/*.tsbuildinfo',
    ],
  },

  // Base recommended JS rules
  js.configs.recommended,

  // Generic JS/JSX settings for the repo
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        // Browser
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        // Node
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },

  // Client (React, Vite)
  {
    files: ['apps/nap-client/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
      },
    },
  },

  // Server (Node)
  {
    files: ['apps/nap-serv/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        fetch: 'readonly',
      },
    },
    plugins: {
      import: eslintPluginImport,
    },
    rules: {
      'import/no-unresolved': ['error', { caseSensitive: false }],
    },
  },

  // Tests (Vitest)
  {
    files: ['**/tests/**/*.js', '**/vitest.setup.js', '**/vitest.config.*'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        it: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'import/no-unresolved': 'off',
    },
  },
];
