/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { routes } from './routes.js';
import { App } from './App.js';

// Create browser subscriptions once, outside React's StrictMode render checks.
const router = createBrowserRouter(routes);
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <App router={router} />
  </StrictMode>
);
