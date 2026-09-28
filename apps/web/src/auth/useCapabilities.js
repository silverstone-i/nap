/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback } from 'react';
import { ApiError } from '../api/client.js';
import { can } from './capabilities.js';
import { useSession } from './SessionContext.jsx';

/**
 * Capability gating for a page (I0005-R011): `can` hides or disables an
 * action the session's capabilities do not match, and `onError` reloads
 * capabilities when the server denies an action anyway.
 * @returns {{can: (routeCapability: string, target?: 'session'|'napsoft') => boolean, onError: (err: unknown) => void}}
 */
export function useCapabilities() {
  const { capabilities, refreshCapabilities } = useSession();
  const check = useCallback(
    (routeCapability, target) => can(capabilities, routeCapability, target),
    [capabilities]
  );
  const onError = useCallback(
    err => {
      if (err instanceof ApiError && err.code === 'FORBIDDEN')
        void refreshCapabilities();
    },
    [refreshCapabilities]
  );
  return { can: check, onError };
}
