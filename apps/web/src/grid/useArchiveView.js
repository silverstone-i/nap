/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * A page's list view, kept in the URL as `?view=archived` so reload, back,
 * forward, and a copied link keep it (I0011-R003). A missing or other value
 * means Active, so a visit without it opens on Active. Switching to Active
 * removes `view` and leaves every other parameter alone.
 * @returns {[boolean, (archived: boolean) => void]} Whether the Archived view is shown, and its setter.
 */
export function useArchiveView() {
  const [params, setParams] = useSearchParams();
  const archived = params.get('view') === 'archived';
  const setArchived = useCallback(
    next =>
      setParams(current => {
        const updated = new URLSearchParams(current);
        if (next) updated.set('view', 'archived');
        else updated.delete('view');
        return updated;
      }),
    [setParams]
  );
  return [archived, setArchived];
}
