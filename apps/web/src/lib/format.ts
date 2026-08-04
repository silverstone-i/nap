/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** Accounting style: negatives in parentheses, per BRAND.md numerics. */
export function formatCurrency(amount: number): string {
  if (amount < 0) return `(${currency.format(-amount)})`;
  return currency.format(amount);
}

const date = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** Formats an ISO date string (YYYY-MM-DD) as e.g. "Aug 1, 2026". */
export function formatDate(iso: string): string {
  return date.format(new Date(`${iso}T00:00:00Z`));
}
