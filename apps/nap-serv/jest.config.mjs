export default {
  transform: {
    '^.+\\.js$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  verbose: true,
  moduleNameMapper: {},

  // setupFilesAfterEnv: ['<rootDir>/tests/setupTests.js'],


  // testEnvironment: 'node',
  // roots: ['<rootDir>/tests'],
  // moduleFileExtensions: ['js', 'json'],
  // transform: {},
  // collectCoverageFrom: ['src/**/*.js'],
  // globals: {
  //   'jest': {
  //     useESM: true,
  //   },
  // },
};