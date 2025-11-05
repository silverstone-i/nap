import React, { useMemo, useState } from 'react';
import { useRoutes, Link, useLocation } from 'react-router-dom';
import {
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  Divider,
  Tooltip
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Business as BusinessIcon,
  AccountBalance as AccountBalanceIcon,
  Receipt as ReceiptIcon,
  Assessment as AssessmentIcon,
  ListAlt as ListAltIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { routes } from './routes.jsx';
import { useAuth } from './context/AuthContext.jsx';
import napLogo from './assets/nap-logo.png';

const drawerWidth = 240;

// List of navigation items corresponding to the high level modules
const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: <DashboardIcon /> },
  { label: 'Projects', path: '/projects', icon: <BusinessIcon /> },
  { label: 'Budgets', path: '/budgets', icon: <ListAltIcon /> },
  { label: 'Actual Costs', path: '/actual-costs', icon: <ReceiptIcon /> },
  { label: 'Change Orders', path: '/change-orders', icon: <ReceiptIcon /> },
  { label: 'Vendors & AP/AR', path: '/vendors', icon: <AccountBalanceIcon /> },
  { label: 'Accounting & GL', path: '/accounting', icon: <AccountBalanceIcon /> },
  { label: 'Reports', path: '/reports', icon: <AssessmentIcon /> },
  { label: 'Settings', path: '/settings', icon: <SettingsIcon /> }
];

// The main application component renders the global layout consisting of
// a top bar, navigation drawer and a content outlet.  It uses
// React Router's useRoutes() to render the routes defined in
// routes.jsx.  The drawer behaves responsively: permanent on larger
// screens and temporary on small devices.
export default function App() {
  const element = useRoutes(routes);
  const { user, logout } = useAuth();
  const location = useLocation();
  const theme = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isLoginRoute = location.pathname === '/login';

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const activeNavItem = useMemo(() => {
    return navItems.find(
      (item) => location.pathname === item.path || (item.path === '/dashboard' && location.pathname === '/')
    );
  }, [location.pathname]);

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          height: 120,
          borderBottom: '1px solid',
          borderColor: theme.palette.primary.light,
          backgroundColor: theme.palette.primary.dark,
          px: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Box
          sx={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid',
            borderColor: theme.palette.primary.light,
            backgroundColor: theme.palette.background.paper
          }}
        >
          <Box
            component="img"
            src={napLogo}
            alt="NAP logo"
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Box>
      </Box>
      <Divider sx={{ borderColor: theme.palette.primary.light, opacity: 0.4 }} />
      <List sx={{ flexGrow: 1, py: 2 }}>
        {navItems.map((item) => {
          const selected =
            location.pathname === item.path || (item.path === '/dashboard' && location.pathname === '/');

          return (
            <ListItem key={item.label} disablePadding>
              <ListItemButton
                component={Link}
                to={item.path}
                selected={selected}
                onClick={() => setMobileOpen(false)}
                sx={{
                  mx: 1,
                  mb: 0.5,
                  borderRadius: 1,
                  color: theme.palette.primary.contrastText,
                  '& .MuiListItemIcon-root': { color: 'inherit', minWidth: 36 },
                  '&.Mui-selected': {
                    backgroundColor: theme.palette.primary.light,
                    color: theme.palette.getContrastText(theme.palette.primary.light)
                  },
                  '&.Mui-selected:hover': {
                    backgroundColor: theme.palette.primary.light
                  }
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  if (isLoginRoute) {
    return <>{element}</>;
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }} aria-label="navigation">
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, bgcolor: 'primary.main', color: 'primary.contrastText' }
          }}
        >
          {drawer}
        </Drawer>
        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, bgcolor: 'primary.main', color: 'primary.contrastText' }
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Box
          component="header"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: theme.zIndex.drawer + 1,
            backgroundColor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              height: 64,
              px: { xs: 2, md: 4 },
              borderBottom: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'background.paper'
            }}
          >
            {user && (
              <Tooltip title="Log out">
                <IconButton color="primary" onClick={logout} size="large">
                  <LogoutIcon />
                </IconButton>
              </Tooltip>
            )}
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {user?.tenant || ''}
              </Typography>
              {user?.email && (
                <Typography variant="body2" color="text.secondary">
                  {user.email}
                </Typography>
              )}
            </Box>
            <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end' }}>
            </Box>
            <IconButton
              color="inherit"
              aria-label="open navigation"
              onClick={handleDrawerToggle}
              sx={{ display: { sm: 'none' }, color: 'text.primary' }}
            >
              <MenuIcon />
            </IconButton>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 56,
              px: { xs: 2, md: 4 },
              backgroundColor: 'background.paper'
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>
              {activeNavItem ? activeNavItem.label : ''}
            </Typography>
          </Box>
        </Box>
        <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 }, width: { sm: `calc(100% - ${drawerWidth}px)` } }}>
          {element}
        </Box>
      </Box>
    </Box>
  );
}
