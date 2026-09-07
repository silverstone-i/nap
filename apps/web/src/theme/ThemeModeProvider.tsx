/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from './theme.js';

import { ThemeModeContext, type ThemeMode } from './useThemeMode.js';

/**
 * Does: Reads a supported preference or returns system when storage is unusable.
 * Called by: The provider's initial state before page content renders.
 */
function readPreference(): ThemeMode {
  try {
    const saved = window.localStorage.getItem('nap:theme-mode');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Browser privacy settings can deny storage; system still works.
  }
  return 'system';
}

/**
 * Does: Applies the user's theme and tracks operating-system color changes.
 * Called by: App around the router, including loading and failure views.
 */
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [preference, setMode] = useState(readPreference);
  const [media] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)')
  );
  const [systemDark, setSystemDark] = useState(() => media.matches);
  const resolvedMode =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  const theme = useMemo(() => createAppTheme(resolvedMode), [resolvedMode]);

  useEffect(() => {
    /** Does: Updates the observed system preference after an OS change. */
    function onChange(event: MediaQueryListEvent) {
      setSystemDark(event.matches);
    }
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [media]);

  /** Does: Applies a selection immediately and persists it when storage allows. */
  function setPreference(next: ThemeMode) {
    setMode(next);
    try {
      window.localStorage.setItem('nap:theme-mode', next);
    } catch {
      // Keep the current in-memory selection when persistence is unavailable.
    }
  }

  return (
    <ThemeModeContext.Provider
      value={{ preference, resolvedMode, setPreference }}
    >
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
