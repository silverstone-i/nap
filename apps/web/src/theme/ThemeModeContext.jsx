/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/* eslint-disable react-refresh/only-export-components --
 * The provider and its `useThemeMode` accessor are one unit. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import {
  STORAGE_KEYS,
  readStorage,
  writeStorage,
} from '../storage/localStorage.js';
import { buildTheme } from './theme.js';

const MODES = ['dark', 'light', 'system'];

/** @returns {boolean} Whether the OS currently prefers a dark appearance. */
function systemPrefersDark() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  );
}

const ThemeModeContext = createContext(null);

/**
 * Owns the browser-local display-mode preference (F0001-R011, R012) and
 * applies the resolved MUI theme. `System` tracks OS appearance changes
 * live, with no reload required.
 * @param {{children: import('react').ReactNode}} props
 * @returns {JSX.Element}
 */
export function ThemeModeProvider({ children }) {
  const [mode, setModeState] = useState(() => {
    const stored = readStorage(STORAGE_KEYS.displayMode);
    return MODES.includes(stored) ? stored : 'system';
  });
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = event => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const setMode = useCallback(next => {
    if (!MODES.includes(next)) return;
    setModeState(next);
    writeStorage(STORAGE_KEYS.displayMode, next);
  }, []);

  const resolvedMode =
    mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
  const theme = useMemo(() => buildTheme(resolvedMode), [resolvedMode]);
  const value = useMemo(
    () => ({ mode, resolvedMode, setMode }),
    [mode, resolvedMode, setMode]
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

/** @returns {{mode: 'dark'|'light'|'system', resolvedMode: 'dark'|'light', setMode: (mode: string) => void}} */
export function useThemeMode() {
  const context = useContext(ThemeModeContext);
  if (!context)
    throw new Error('useThemeMode must be used within ThemeModeProvider');
  return context;
}
