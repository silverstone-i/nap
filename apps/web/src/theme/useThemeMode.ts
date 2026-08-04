/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createContext, useContext } from 'react';

export type ThemeModePreference = 'light' | 'dark' | 'system';

export interface ThemeModeContextValue {
  preference: ThemeModePreference;
  setPreference: (preference: ThemeModePreference) => void;
}

// Defined here rather than in ThemeModeProvider.tsx so that file exports
// only a component (react-refresh/only-export-components).
export const ThemeModeContext = createContext<ThemeModeContextValue | null>(
  null
);

export function useThemeMode(): ThemeModeContextValue {
  const value = useContext(ThemeModeContext);
  if (!value) {
    throw new Error('useThemeMode must be used within ThemeModeProvider');
  }
  return value;
}
