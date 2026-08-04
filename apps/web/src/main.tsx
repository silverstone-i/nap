/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeModeProvider } from './theme/ThemeModeProvider';
import { App } from './App';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Mount node #root not found');
}

createRoot(container).render(
  <StrictMode>
    <ThemeModeProvider>
      <CssBaseline />
      {/* basename tracks Vite's `base` so the app lives under /nap/. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </ThemeModeProvider>
  </StrictMode>
);
