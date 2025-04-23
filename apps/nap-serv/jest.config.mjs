export default {
  transform: {
    '^.+\\.js$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  verbose: true,
  moduleNameMapper: {},
  coveragePathIgnorePatterns: ['/src/db/db.js'],
};