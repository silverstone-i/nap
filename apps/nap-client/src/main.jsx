/**
 * @file Application entry point — providers and OS-aware theme detection
 * @module nap-client/main
 *
 * Wraps App in ThemeProvider, QueryClientProvider, AuthProvider,
 * and ModuleActionsProvider.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppTheme } from './theme.js';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ModuleActionsProvider } from './contexts/ModuleActionsContext.jsx';
import App from './App.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function ThemedApp() {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = useMemo(() => createAppTheme(prefersDarkMode ? 'dark' : 'light'), [prefersDarkMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ModuleActionsProvider>
            <App />
          </ModuleActionsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>,
);
