import React, { Fragment, useMemo, useState } from 'react';
import { useRoutes, Link, useLocation } from 'react-router-dom';
import {
  IconButton,
  Drawer,
  List,
  Collapse,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  Divider,
  Tooltip,
  useMediaQuery
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
  Logout as LogoutIcon,
  PeopleAlt as PeopleAltIcon,
  ExpandLess,
  ExpandMore
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { routes } from './routes.jsx';
import { useAuth } from './context/AuthContext.jsx';
import napLogo from './assets/nap-logo.png';
import napLogoDark from './assets/nap-logo-dark.svg';
import ModuleBar from './components/ModuleBar.jsx';
import { ModuleActionsContext } from './context/ModuleActionsContext.jsx';
import { isNapsoftEmployee } from './utils/isNapsoftEmployee.js';

const drawerWidth = 240;

// List of navigation items corresponding to the high level modules
const baseNavItems = [
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
  const isCompactModuleBar = useMediaQuery(theme.breakpoints.down('lg'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState({});
  const [moduleActionOverrides, setModuleActionOverrides] = useState(null);
  const isLoginRoute = location.pathname === '/login';

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const isNapsoftUser = useMemo(() => isNapsoftEmployee(user), [user]);

  const navItems = useMemo(() => {
    const items = [...baseNavItems];
    if (isNapsoftUser) {
      const tenantsMenu = {
        label: 'Tenants',
        icon: <PeopleAltIcon />,
        children: [
          { label: 'Manage Tenants', path: '/tenants/manage' },
          { label: 'Manage Users', path: '/tenants/users' }
        ]
      };
      const settingsIndex = items.findIndex((item) => item.path === '/settings');
      const insertIndex = settingsIndex >= 0 ? settingsIndex : items.length;
      items.splice(insertIndex, 0, tenantsMenu);
    }
    return items;
  }, [isNapsoftUser]);

  const moduleBarActions = useMemo(() => {
    const path = location.pathname;
    if (isNapsoftUser && (path.startsWith('/tenants/manage') || path.startsWith('/tenants/users'))) {
      return ['Create', 'View', 'Update', 'Archive', 'Restore'].map((label) => ({
        label,
        size: 'small'
      }));
    }
    return null;
  }, [location.pathname, isNapsoftUser]);
  const resolvedModuleActions = moduleActionOverrides ?? moduleBarActions;

  const activeNavItem = useMemo(() => {
    for (const item of navItems) {
      const isDashboardRoute =
        item.path === '/dashboard' && (location.pathname === '/' || location.pathname === '/dashboard');

      if (item.path && (location.pathname === item.path || isDashboardRoute)) {
        return item;
      }

      if (item.children) {
        const childMatch = item.children.find((child) => location.pathname.startsWith(child.path));
        if (childMatch) {
          return childMatch;
        }
      }
    }
    return null;
  }, [location.pathname, navItems]);

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          height: 120,
          borderBottom: '1px solid',
          borderColor: theme.palette.divider,
          backgroundColor: theme.palette.background.sidebar,
          px: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Box
          sx={{
            position: 'relative',
            width: 96,
            height: 96,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Box
            sx={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.palette.mode === 'dark' ? 'transparent' : theme.palette.background.surface
            }}
          >
          <Box
            component="img"
            src={theme.palette.mode === 'dark' ? napLogoDark : napLogo}
            alt="NAP logo"
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          </Box>
        </Box>
      </Box>
      <Divider sx={{ borderColor: theme.palette.divider, opacity: 0.6 }} />
      <List sx={{ flexGrow: 1, py: 2 }}>
        {navItems.map((item) => {
          const hasChildren = Array.isArray(item.children) && item.children.length > 0;
          const isDashboardRoute =
            item.path === '/dashboard' && (location.pathname === '/' || location.pathname === '/dashboard');
          const isExactMatch = item.path && (location.pathname === item.path || isDashboardRoute);
          const childMatch = hasChildren
            ? item.children.some((child) => location.pathname.startsWith(child.path))
            : false;
          const manualToggle = openMenus[item.label];
          const isExpanded =
            hasChildren && typeof manualToggle === 'boolean' ? manualToggle : hasChildren ? childMatch : false;
          const selected = !hasChildren && isExactMatch;
          const parentActive = hasChildren && childMatch;

          const handleParentClick = () => {
            if (hasChildren) {
              setOpenMenus((prev) => ({
                ...prev,
                [item.label]: !isExpanded
              }));
            } else {
              setMobileOpen(false);
            }
          };

          return (
            <Fragment key={item.label}>
              <ListItem disablePadding>
                <ListItemButton
                  component={!hasChildren ? Link : undefined}
                  to={!hasChildren ? item.path : undefined}
                  selected={selected}
                  onClick={handleParentClick}
                  sx={{
                    mx: 1,
                    mb: 0.5,
                    borderRadius: 1,
                    minHeight: 48,
                    fontWeight: selected ? 600 : 500,
                    color: theme.palette.text.secondary,
                    '& .MuiListItemIcon-root': { color: 'inherit', minWidth: 36 },
                    '&.Mui-selected': {
                      backgroundColor: theme.palette.primary.main,
                      color: theme.palette.primary.contrastText,
                      '& .MuiListItemIcon-root': {
                        color: theme.palette.primary.contrastText
                      }
                    },
                    '&.Mui-selected:hover': {
                      backgroundColor: theme.palette.primary.main
                    },
                    '&:hover': {
                      backgroundColor: theme.palette.action.hover,
                      color: theme.palette.text.primary,
                      '& .MuiListItemIcon-root': {
                        color: theme.palette.text.primary
                      }
                    },
                    ...(parentActive
                      ? {
                          backgroundColor: theme.palette.action.selected,
                          color: theme.palette.text.primary,
                          '& .MuiListItemIcon-root': {
                            color: theme.palette.text.primary
                          }
                        }
                      : {})
                  }}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                  {hasChildren ? (isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />) : null}
                </ListItemButton>
              </ListItem>
              {hasChildren && (
                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {item.children.map((child) => {
                      const childSelected = location.pathname.startsWith(child.path);
                      return (
                        <ListItemButton
                          key={child.label}
                          component={Link}
                          to={child.path}
                          selected={childSelected}
                          onClick={() => setMobileOpen(false)}
                          sx={{
                            mx: 2,
                            mb: 0.5,
                            borderRadius: 1,
                            minHeight: 44,
                            pl: 7,
                            fontWeight: childSelected ? 600 : 500,
                            color: theme.palette.text.secondary,
                            '&.Mui-selected': {
                              backgroundColor: theme.palette.primary.main,
                              color: theme.palette.primary.contrastText
                            },
                            '&.Mui-selected:hover': {
                              backgroundColor: theme.palette.primary.main
                            },
                            '&:hover': {
                              backgroundColor: theme.palette.action.hover,
                              color: theme.palette.text.primary
                            }
                          }}
                        >
                          <ListItemText primary={child.label} />
                        </ListItemButton>
                      );
                    })}
                  </List>
                </Collapse>
              )}
            </Fragment>
          );
        })}
      </List>
    </Box>
  );

  if (isLoginRoute) {
    return <>{element}</>;
  }

  return (
    <ModuleActionsContext.Provider value={{ actions: moduleActionOverrides, setActions: setModuleActionOverrides }}>
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
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              bgcolor: 'background.sidebar',
              color: 'text.primary',
              borderRight: '1px solid',
              borderColor: 'divider'
            }
          }}
        >
          {drawer}
        </Drawer>
        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              bgcolor: 'background.sidebar',
              color: 'text.primary',
              borderRight: '1px solid',
              borderColor: 'divider'
            }
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: theme.zIndex.drawer + 1,
            backgroundColor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            overflowX: 'hidden',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'auto minmax(0, 1fr) auto', sm: 'auto minmax(0, 1fr) auto' },
              alignItems: 'center',
              gap: 2,
              minHeight: 64,
              px: { xs: 2, md: 4 },
              borderBottom: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'background.paper',
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            <IconButton
              color="inherit"
              aria-label="open navigation"
              onClick={handleDrawerToggle}
              sx={{ display: { sm: 'none' }, color: 'text.primary' }}
            >
              <MenuIcon />
            </IconButton>
            <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}
              >
                {user?.tenant || ''}
              </Typography>
              {user?.email && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}
                >
                  {user.email}
                </Typography>
              )}
            </Box>
            {user && (
              <Tooltip title="Log out" sx={{ justifySelf: 'end' }}>
                <IconButton color="primary" onClick={logout} size="large">
                  <LogoutIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexDirection: isCompactModuleBar ? 'column' : 'row',
              alignItems: isCompactModuleBar ? 'flex-start' : 'center',
              gap: isCompactModuleBar ? 1.5 : 2,
              px: { xs: 2, md: 4 },
              py: 1.5,
              backgroundColor: 'background.paper',
              borderBottom: '1px solid',
              borderColor: 'divider',
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                flexShrink: 0
              }}
            >
              {activeNavItem ? activeNavItem.label : ''}
            </Typography>
            {resolvedModuleActions ? (
              <Box
                sx={{
                  flexGrow: 1,
                  minWidth: 0,
                  width: '100%',
                  maxWidth: '100%'
                }}
              >
                <ModuleBar
                  actions={resolvedModuleActions}
                  sx={{
                    mb: 0,
                    width: '100%',
                    minWidth: 0,
                    flexWrap: 'wrap',
                    justifyContent: isCompactModuleBar ? 'flex-start' : 'flex-end',
                    gap: 1,
                    rowGap: 1,
                    maxWidth: '100%'
                  }}
                  spacing={isCompactModuleBar ? 1 : 1.5}
                />
              </Box>
            ) : null}
          </Box>
        </Box>
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 2, md: 4 },
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            boxSizing: 'border-box',
            overflowX: 'hidden'
          }}
        >
          {element}
        </Box>
      </Box>
      </Box>
    </ModuleActionsContext.Provider>
  );
}
