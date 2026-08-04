/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMemo, useState, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { lightTheme, darkTheme } from './theme';
import {
  ThemeModeContext,
  type ThemeModeContextValue,
  type ThemeModePreference,
} from './useThemeMode';

// Theme preference is a device preference, not screen state, so it lives in
// localStorage rather than the URL (an exception to "scope lives in the
// URL", like the default entity — see docs/RULES/web-shell.md). Absent key
// means 'system'.
const STORAGE_KEY = 'nap:theme-mode';

function readStoredPreference(): ThemeModePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage unavailable (e.g. blocked by browser settings).
  }
  return 'system';
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(readStoredPreference);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');

  const value = useMemo<ThemeModeContextValue>(
    () => ({
      preference,
      setPreference: next => {
        setPreferenceState(next);
        try {
          if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
          else window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Persistence is best-effort; the in-memory preference still applies.
        }
      },
    }),
    [preference]
  );

  const mode =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={mode === 'dark' ? darkTheme : lightTheme}>
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
