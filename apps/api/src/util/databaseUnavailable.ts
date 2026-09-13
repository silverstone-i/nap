/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/**
 * Does: Recognizes database connectivity and missing-relation failures without exposing driver text.
 * Called by: module dispatch and framework error mapping when database work fails.
 */
export function databaseUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? error.code : undefined;
  if (
    error instanceof Error &&
    [
      'Connection terminated unexpectedly',
      'Connection terminated',
      'Connection terminated due to connection timeout',
      'timeout exceeded when trying to connect',
    ].includes(error.message)
  )
    return true;
  return (
    typeof code === 'string' &&
    (code.startsWith('08') ||
      [
        '57P01',
        '57P02',
        '57P03',
        '28P01',
        '28000',
        '53300',
        '42P01',
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EHOSTUNREACH',
      ].includes(code))
  );
}
