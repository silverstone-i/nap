import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { createAppTheme } from './theme.js';
import { AuthProvider } from './context/AuthContext.jsx';
import { ModuleToolbarProvider } from './context/ModuleActionsContext.jsx';

// Create a React Query client to manage API calls and caching.  This
// instance will be shared throughout the application.
const queryClient = new QueryClient();

// The root element for rendering our React application.  It wraps
// the application with providers for React Query, Material UI theming
// and authentication context.
function ThemedApp() {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = useMemo(() => createAppTheme(prefersDarkMode ? 'dark' : 'light'), [prefersDarkMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <ModuleToolbarProvider>
          <App />
        </ModuleToolbarProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemedApp />
    </QueryClientProvider>
  </React.StrictMode>
);
