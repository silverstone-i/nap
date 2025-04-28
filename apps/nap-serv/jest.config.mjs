export default {
  transform: {
    '^.+\\.js$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  verbose: true,
  moduleNameMapper: {},
  coveragePathIgnorePatterns: ['/src/db/db.js', '/modules/tenants/apiRoutes/v1'],
  roots: ['<rootDir>/tests'],
  testMatch: [
  "**/tests/**/*.(test|spec).js",
  ]

  // setupFilesAfterEnv: ['./jest.setup.js'],

};