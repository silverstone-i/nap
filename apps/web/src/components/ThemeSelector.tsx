/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import TextField from '@mui/material/TextField';
import { useThemeMode } from '../theme/useThemeMode.js';
import { selectorStyles } from '../theme/styles.js';

/**
 * Does: Lets the user select a labeled system, light, or dark display preference.
 * Called by: The holding page after its descriptive content.
 */
export function ThemeSelector() {
  const { preference, setPreference } = useThemeMode();
  return (
    <TextField
      select
      label="Theme"
      value={preference}
      sx={selectorStyles}
      slotProps={{ select: { native: true } }}
      onChange={event => {
        const next = event.target.value;
        if (next === 'system' || next === 'light' || next === 'dark')
          setPreference(next);
      }}
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </TextField>
  );
}
