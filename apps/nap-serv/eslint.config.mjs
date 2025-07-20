import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        console: true,
        process: true,
        Buffer: true,
        __dirname: true,
        __filename: true,
        module: true,
        require: true,
        exports: true,
      },
    },
    settings: {
      'import/resolver': {
        alias: {
          map: [['pg-schemata', './node_modules/pg-schemata']],
          extensions: ['.js'],
        },
      },
    },
    plugins: {
      import: require('eslint-plugin-import'),
    },
    rules: {
      'import/no-unresolved': 'error',
    },
  },
  {
    files: ['**/tests/**/*.js', 'vitest.setup.js'],
    languageOptions: {
      globals: {
        describe: true,
        test: true,
        expect: true,
        beforeAll: true,
        afterAll: true,
        beforeEach: true,
        afterEach: true,
        it: true,
        vi: true,
      },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
];
