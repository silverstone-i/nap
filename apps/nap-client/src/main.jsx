/**
 * @file Application entry point — minimal provider setup for Phase 1
 * @module nap-client/main
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, CssBaseline, createTheme } from '@mui/material';
import App from './App.jsx';

const theme = createTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
