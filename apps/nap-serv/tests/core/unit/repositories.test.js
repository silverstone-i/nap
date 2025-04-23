import { jest } from '@jest/globals';
import repositories from '../../../src/db/repositories.js';

// Mock the tenant repositories
jest.mock('../../../modules/tenants/tenantRepositories.js', () => ({
  default: {
    Tenants: jest.fn(),
    NapUsers: jest.fn(),
  },
}), { virtual: true });

describe('repositories loader', () => {
  it('should load tenant repositories', () => {
    expect(repositories).toHaveProperty('tenants');
    expect(repositories).toHaveProperty('napUsers');
  });

  it('should contain repository functions', () => {
    expect(typeof repositories.tenants).toBe('function');
    expect(typeof repositories.napUsers).toBe('function');
  });
});