/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createContext, useContext } from 'react';

/**
 * Does: Represents the user's device-local display preference.
 * Used by: The theme provider and selector.
 */
export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * Does: Holds the selected preference, effective mode, and preference action.
 * Used by: Presentation components through useThemeMode.
 */
export const ThemeModeContext = createContext<{
  preference: ThemeMode;
  resolvedMode: 'light' | 'dark';
  setPreference: (preference: ThemeMode) => void;
} | null>(null);

/**
 * Does: Returns the active display preference and its selection action.
 * Called by: Theme-aware controls rendered inside ThemeModeProvider.
 */
export function useThemeMode() {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error('ThemeModeProvider is required');
  return context;
}
