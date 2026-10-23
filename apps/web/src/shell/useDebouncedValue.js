/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';

/** How long a header search waits after the last keystroke (I0001-R029). */
export const SEARCH_DELAY_MS = 300;

/**
 * `value`, once it has stopped changing for `delay` milliseconds, so a
 * search field does not start a request on every keystroke.
 * @template T
 * @param {T} value
 * @param {number} [delay]
 * @returns {T}
 */
export function useDebouncedValue(value, delay = SEARCH_DELAY_MS) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
