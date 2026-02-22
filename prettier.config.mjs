/**
 * Prettier config for the monorepo
 */
const config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 144,
  tabWidth: 2,
  useTabs: false,
  bracketSpacing: true,
  arrowParens: 'always',
  jsxSingleQuote: false,
  endOfLine: 'lf',
  overrides: [{ files: ['*.md'], options: { printWidth: 80 } }],
};

export default config;
