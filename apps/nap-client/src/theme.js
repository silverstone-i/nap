import { createTheme } from '@mui/material/styles';

// Create a Material‑UI theme that matches the design language
// described in the specification.  The palette uses a deep navy
// primary colour and a warm orange secondary colour.  Additional
// semantic colours (success, warning, error) reflect typical
// statuses in a cost management system.  The shape and component
// overrides set consistent border radii and elevations.
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#003e6b',
      contrastText: '#ffffff'
    },
    secondary: {
      main: '#f79c3c',
      contrastText: '#ffffff'
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff'
    },
    success: {
      main: '#4caf50'
    },
    warning: {
      main: '#ffa000'
    },
    error: {
      main: '#d32f2f'
    },
    text: {
      primary: '#212121'
    }
  },
  typography: {
    fontFamily: 'Roboto, sans-serif',
    h1: {
      fontSize: '2rem',
      fontWeight: 500
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 500
    },
    h3: {
      fontSize: '1.25rem',
      fontWeight: 500
    }
  },
  shape: {
    borderRadius: 8
  },
  components: {
    MuiCard: {
      defaultProps: {
        elevation: 1
      },
      styleOverrides: {
        root: {
          borderRadius: 8
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none'
        }
      }
    }
  }
});

export default theme;