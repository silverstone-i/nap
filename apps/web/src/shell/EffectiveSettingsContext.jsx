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
import { getEffectiveSettings } from '../api/endpoints.js';

// No logo and no storage until the tenant's values load (M0006-02-R014).
const DEFAULTS = Object.freeze({
  ...settingDefaults(),
  logoFileId: null,
  storageConnected: false,
});

const EffectiveSettingsContext = createContext({
  settings: DEFAULTS,
  refresh: () => {},
});

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
  const value = useMemo(() => ({ settings, refresh }), [settings, refresh]);
  return (
    <EffectiveSettingsContext.Provider value={value}>
      {children}
    </EffectiveSettingsContext.Provider>
  );
}

/**
 * The effective settings and a `refresh` to reload them after a change.
 * Outside a provider, such as in a page test, the schema defaults.
 * @returns {{settings: Record<string, unknown>, refresh: () => void}}
 */
export function useEffectiveSettings() {
  return useContext(EffectiveSettingsContext);
}
