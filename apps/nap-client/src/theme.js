import { createTheme } from '@mui/material/styles';

const paletteByMode = {
  light: {
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
      primary: '#212121',
      secondary: '#424242'
    },
    divider: '#d1d9e6'
  },
  dark: {
    primary: {
      main: '#66b2ff',
      contrastText: '#0a1929'
    },
    secondary: {
      main: '#ffb74d',
      contrastText: '#1c1c1c'
    },
    background: {
      default: '#0f172a',
      paper: '#111827'
    },
    success: {
      main: '#81c784'
    },
    warning: {
      main: '#ffb74d'
    },
    error: {
      main: '#ef5350'
    },
    text: {
      primary: '#f1f5ff',
      secondary: '#c7d3e6'
    },
    divider: '#2b3648'
  }
};

const baseThemeOptions = {
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
};

export const createAppTheme = (mode = 'light') => {
  const palette = paletteByMode[mode] || paletteByMode.light;
  return createTheme({
    ...baseThemeOptions,
    palette: {
      mode,
      ...palette
    }
  });
};

export default createAppTheme;
