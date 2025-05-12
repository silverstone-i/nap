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
    rules: {},
  },
  {
    files: ['**/tests/**/*.js', 'jest.setup.js'],
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
        jest: true,
      },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
];