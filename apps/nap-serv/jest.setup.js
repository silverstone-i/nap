import { jest } from '@jest/globals';

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  if (console.log.mockRestore) console.log.mockRestore();
  if (console.error.mockRestore) console.error.mockRestore();
  if (console.warn.mockRestore) console.warn.mockRestore();
});
