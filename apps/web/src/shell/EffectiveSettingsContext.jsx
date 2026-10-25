/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/* eslint-disable react-refresh/only-export-components --
   the provider and its hook belong together. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { settingDefaults } from '@nap/shared';
import { ApiError } from '../api/client.js';
import {
  getEffectiveSettings,
  getProfile,
  updateProfile,
} from '../api/endpoints.js';

// No logo, storage, or profile image until the values load (M0006-02-R014,
// M0006-03-R007).
const DEFAULTS = Object.freeze({
  ...settingDefaults(),
  logoFileId: null,
  storageConnected: false,
  profileImage: null,
});

const EffectiveSettingsContext = createContext({
  settings: DEFAULTS,
  refresh: () => {},
  saveRecordsPerPage: async () => {},
});

/**
 * Save `pageSize` as the member's `recordsPerPage` override
 * (M0006-03-R008), retrying once if the profile changed meanwhile.
 * @param {number} pageSize
 * @returns {Promise<void>}
 */
async function saveOverride(pageSize) {
  for (let attempt = 0; ; attempt++) {
    const { revision } = await getProfile();
    try {
      await updateProfile({
        overrides: { recordsPerPage: pageSize },
        revision,
      });
      return;
    } catch (err) {
      if (
        !(err instanceof ApiError) ||
        err.code !== 'STALE_REVISION' ||
        attempt
      )
        throw err;
    }
  }
}

/**
 * Loads the selected tenant's effective settings (M0006-01-R008) for every
 * page in the shell. The shell is keyed by tenant, so switching tenants
 * loads afresh. Until the load finishes, or if it fails, pages see the
 * schema defaults.
 * @param {{tenantId: string|null|undefined, children: import('react').ReactNode}} props
 * @returns {JSX.Element}
 */
export function EffectiveSettingsProvider({ tenantId, children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const refresh = useCallback(() => {
    if (!tenantId) return;
    Promise.resolve()
      .then(() => getEffectiveSettings())
      .then(setSettings)
      .catch(() => setSettings(DEFAULTS));
  }, [tenantId]);
  useEffect(refresh, [refresh]);
  // A grid's page-size choice becomes the member's override, so every grid
  // in every browser starts there (M0006-03-R008). Without a tenant there is
  // no profile, and the choice lasts only for the page.
  const saveRecordsPerPage = useCallback(
    async pageSize => {
      if (!tenantId || pageSize === settings.recordsPerPage) return;
      await saveOverride(pageSize).catch(() => {});
      refresh();
    },
    [tenantId, settings.recordsPerPage, refresh]
  );
  const value = useMemo(
    () => ({ settings, refresh, saveRecordsPerPage }),
    [settings, refresh, saveRecordsPerPage]
  );
  return (
    <EffectiveSettingsContext.Provider value={value}>
      {children}
    </EffectiveSettingsContext.Provider>
  );
}

/**
 * The effective settings, a `refresh` to reload them after a change, and
 * `saveRecordsPerPage` for a grid's page-size choice. Outside a provider,
 * such as in a page test, the schema defaults and no-ops.
 * @returns {{settings: Record<string, unknown>, refresh: () => void, saveRecordsPerPage: (pageSize: number) => Promise<void>}}
 */
export function useEffectiveSettings() {
  return useContext(EffectiveSettingsContext);
}
