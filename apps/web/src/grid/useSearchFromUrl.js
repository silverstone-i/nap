/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Take a page's search from `?q=` on arrival or whenever a link sets it,
 * such as the archived-conflict link (I0011-R008), then drop `q` from the
 * URL so the search box owns the value from there.
 * @param {(value: string) => void} setSearch
 * @returns {void}
 */
export function useSearchFromUrl(setSearch) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q');
  useEffect(() => {
    if (q === null) return;
    setSearch(q);
    setParams(
      current => {
        const kept = new URLSearchParams(current);
        kept.delete('q');
        return kept;
      },
      { replace: true }
    );
  }, [q, setSearch, setParams]);
}
