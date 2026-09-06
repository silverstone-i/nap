/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/dist/', '**/coverage/', '**/node_modules/', 'temp/']),

  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    files: [
      'packages/shared/src/**/*.ts',
      'packages/shared/tests/**/*.ts',
      'packages/shared/vitest.config.ts',
      'apps/api/src/**/*.ts',
      'apps/api/tests/**/*.ts',
      'apps/api/vitest.config.ts',
      'apps/web/src/**/*.{ts,tsx}',
      'apps/web/tests/**/*.{ts,tsx}',
      'apps/web/vite.config.ts',
    ],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Underscore-prefixed params are intentionally unused — e.g. the 4-arg
      // Express error handler, whose arity is load-bearing.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    files: [
      'apps/api/src/modules/**/schema/migrations/**/*.ts',
      'apps/api/tests/fixtures/migrations/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/models/**'],
              message:
                'Migrations must not import mutable current models; use migration-local definitions or explicit DDL.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ArrowFunctionExpression > ObjectPattern.params > Property[key.name='models']",
          message:
            'Migrations must not use MigrationContext.models; use migration-local definitions or explicit DDL.',
        },
        {
          selector:
            "FunctionExpression > ObjectPattern.params > Property[key.name='models']",
          message:
            'Migrations must not use MigrationContext.models; use migration-local definitions or explicit DDL.',
        },
        {
          selector:
            "FunctionDeclaration > ObjectPattern.params > Property[key.name='models']",
          message:
            'Migrations must not use MigrationContext.models; use migration-local definitions or explicit DDL.',
        },
        {
          selector: "MemberExpression[computed=false][property.name='models']",
          message:
            'Migrations must not use MigrationContext.models; use migration-local definitions or explicit DDL.',
        },
        {
          selector: "MemberExpression[computed=true][property.value='models']",
          message:
            'Migrations must not use MigrationContext.models; use migration-local definitions or explicit DDL.',
        },
      ],
    },
  },

  {
    files: ['apps/api/tests/fixtures/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/models/**'],
              message:
                'Migration fixtures must not import mutable current models; use a frozen fixture definition.',
            },
          ],
        },
      ],
    },
  },

  {
    files: [
      'apps/api/src/**/*.ts',
      'apps/api/vitest.config.ts',
      'apps/web/vite.config.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // Last: disables formatting rules that would fight Prettier.
  eslintConfigPrettier,
]);
