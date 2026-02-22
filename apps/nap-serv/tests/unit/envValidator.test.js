/**
 * @file Unit tests for environment variable validation
 * @module nap-serv/tests/unit/envValidator
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';
import { validateEnv, getDatabaseUrl } from '../../src/lib/envValidator.js';

describe('validateEnv', () => {
  it('should pass when all required vars are present', () => {
    const env = { FOO: 'bar', BAZ: 'qux' };
    const result = validateEnv(['FOO', 'BAZ'], env);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('should throw when required vars are missing', () => {
    const env = { FOO: 'bar' };
    expect(() => validateEnv(['FOO', 'MISSING_VAR'], env)).toThrow('Missing required environment variables: MISSING_VAR');
  });

  it('should throw listing all missing vars', () => {
    const env = {};
    expect(() => validateEnv(['A', 'B', 'C'], env)).toThrow('Missing required environment variables: A, B, C');
  });

  it('should pass with empty required list', () => {
    const result = validateEnv([], {});
    expect(result.valid).toBe(true);
  });

  it('should treat empty string values as missing', () => {
    const env = { FOO: '' };
    expect(() => validateEnv(['FOO'], env)).toThrow('Missing required environment variables: FOO');
  });
});

describe('getDatabaseUrl', () => {
  it('should return dev URL for development env', () => {
    const env = { NODE_ENV: 'development', DATABASE_URL_DEV: 'postgres://dev' };
    expect(getDatabaseUrl(env)).toBe('postgres://dev');
  });

  it('should return test URL for test env', () => {
    const env = { NODE_ENV: 'test', DATABASE_URL_TEST: 'postgres://test' };
    expect(getDatabaseUrl(env)).toBe('postgres://test');
  });

  it('should return production URL for production env', () => {
    const env = { NODE_ENV: 'production', DATABASE_URL_PROD: 'postgres://prod' };
    expect(getDatabaseUrl(env)).toBe('postgres://prod');
  });

  it('should throw for invalid NODE_ENV', () => {
    const env = { NODE_ENV: 'staging' };
    expect(() => getDatabaseUrl(env)).toThrow('NODE_ENV is not set to a valid value: "staging"');
  });

  it('should throw when dev URL is missing', () => {
    const env = { NODE_ENV: 'development' };
    expect(() => getDatabaseUrl(env)).toThrow('DATABASE_URL_DEV is not set');
  });

  it('should throw when test URL is missing', () => {
    const env = { NODE_ENV: 'test' };
    expect(() => getDatabaseUrl(env)).toThrow('DATABASE_URL_TEST is not set');
  });
});
