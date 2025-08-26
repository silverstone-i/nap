import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import theme from './theme.js';
import { AuthProvider } from './context/AuthContext.jsx';

// Create a React Query client to manage API calls and caching.  This
// instance will be shared throughout the application.
const queryClient = new QueryClient();

// The root element for rendering our React application.  It wraps
// the application with providers for React Query, Material UI theming
// and authentication context.  The BrowserRouter enables client side
// navigation between pages.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);