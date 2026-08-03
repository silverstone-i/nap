/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './index.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Mount node #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
