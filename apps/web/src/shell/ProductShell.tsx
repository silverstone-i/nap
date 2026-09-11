/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useEffect, useRef, useState } from 'react';
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useNavigation,
} from 'react-router';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Tooltip from '@mui/material/Tooltip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FolderIcon from '@mui/icons-material/Folder';
import BusinessIcon from '@mui/icons-material/Business';
import PeopleIcon from '@mui/icons-material/People';
import { useSession, sessionDestination } from '../auth/session.js';
import { SessionStatus } from '../auth/SessionStatus.js';
import { logout } from '../api/auth.js';
import { getNavigation } from '../api/shell.js';
import { Wordmark } from '../components/Wordmark.js';
import { useThemeMode } from '../theme/useThemeMode.js';
import { RouteLoading } from '../components/RouteLoading.js';
import { ShellContext, readScope } from './scope.js';
import {
  shellBodyStyles,
  shellContentStyles,
  railStyles,
  activeNavigationStyles,
  skipLinkStyles,
  railBrandStyles,
} from '../theme/styles.js';

/**
 * Does: Establishes checked tenant scope and renders shared product navigation.
 * Called by: tenant and central management routes.
 */
export function ProductShell() {
  const { state, setSession, reload, refusal } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const transition = useNavigation();
  const scope = readScope(location.pathname, location.search);
  const desktop = useMediaQuery(theme => theme.breakpoints.up('lg'));
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const [modeMenu, setModeMenu] = useState(false);
  const { preference, setPreference } = useThemeMode();
  /** Does: Dismisses the profile menu and resets its mode selection view. */
  function closeProfile() {
    setProfileAnchor(null);
    setModeMenu(false);
  }
  const [collapsed, setCollapsed] = useState(false);
  const [managementOpen, setManagementOpen] = useState(true);
  const [managementAnchor, setManagementAnchor] = useState<HTMLElement | null>(
    null
  );
  const [navigation, setNavigation] = useState<{
    tenant: string;
    employees: boolean;
  } | null>(null);
  const [failure, setFailure] = useState('');
  const session = state.status === 'ready' ? state.session : null;
  const ready =
    !!session &&
    session.state === 'tenant-selected' &&
    scope.tenant === session.tenantId &&
    !refusal;
  useEffect(() => {
    if (!ready || !scope.tenant) return;
    let active = true;
    const tenant = scope.tenant;
    void getNavigation().then(result => {
      if (!active) return;
      if (result.ok) setNavigation({ tenant, ...result.body.data });
      else setFailure(result.error.message);
    });
    return () => {
      active = false;
    };
  }, [ready, scope.tenant]);
  /**
   * Does: Closes mobile navigation and restores the menu trigger's focus.
   * Called by: dismissal and destination selection.
   */
  function closeMenu() {
    setOpen(false);
    setManagementAnchor(null);
    trigger.current?.focus();
  }
  /**
   * Does: Revokes the session and clears its rendered content.
   * Called by: the header sign-out action.
   */
  async function signOut() {
    const result = await logout();
    if (result.ok) {
      setSession(null);
      await navigate('/login', { replace: true });
    } else setFailure(result.error.message);
  }
  if (state.status !== 'ready') return <SessionStatus />;
  const here = location.pathname + location.search;
  if (!session)
    return <Navigate replace to={`/login?next=${encodeURIComponent(here)}`} />;
  if (session.state === 'password-change-required')
    return <Navigate replace to={sessionDestination(session, here)} />;
  if (scope.invalidTenant || scope.invalidTarget || scope.invalidRecord)
    return (
      <Alert severity="warning">
        This destination is unavailable.{' '}
        <Button component={Link} to="/">
          Go to application
        </Button>
      </Alert>
    );
  if (!scope.central && scope.tenant !== session.tenantId) {
    if (session.canChangeTenant && !session.controlledAccess)
      return (
        <Navigate replace to={`/tenants?next=${encodeURIComponent(here)}`} />
      );
    if (session.state === 'tenant-selection-required')
      return <Navigate replace to={sessionDestination(session)} />;
    return (
      <Alert severity="warning">
        This destination is unavailable.{' '}
        <Button component={Link} to="/">
          Go to application
        </Button>
      </Alert>
    );
  }
  if (
    scope.directory &&
    new URLSearchParams(location.search).get('tab') !== 'employees'
  ) {
    const query = new URLSearchParams(location.search);
    query.set('tab', 'employees');
    return <Navigate replace to={`${location.pathname}?${query}`} />;
  }
  const canManage =
    !session.controlledAccess &&
    session.platformPermissions.includes('admin-tenancy::control::overview');
  const employees =
    navigation?.tenant === session.tenantId && navigation.employees && !refusal;
  const home = session.tenantId ? `/app/${session.tenantId}/dashboard` : '/';
  const directory = `/app/${session.tenantId}/accounting/directories?tab=employees`;
  const heading = scope.central
    ? scope.portalUsers
      ? 'Portal users'
      : 'Tenants'
    : scope.directory
      ? 'Employees'
      : 'Dashboard';
  const denied =
    refusal ||
    (scope.central
      ? !canManage
      : scope.directory && navigation !== null && !employees);
  const links = (
    <Box
      component="nav"
      aria-label="Main navigation"
      id="product-navigation"
      sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <List>
        {session.tenantId && (
          <ListItemButton
            component={Link}
            to={home}
            selected={!scope.central && !scope.directory}
            onClick={closeMenu}
            sx={activeNavigationStyles}
            aria-label="Dashboard"
            aria-current={
              !scope.central && !scope.directory ? 'page' : undefined
            }
          >
            <DashboardIcon />
            {!(desktop && collapsed) && <ListItemText primary="Dashboard" />}
          </ListItemButton>
        )}
        {canManage && (
          <>
            <Tooltip
              title={desktop && collapsed ? 'Tenant Management' : ''}
              placement="right"
            >
              <ListItemButton
                aria-label="Tenant Management"
                aria-expanded={
                  desktop && collapsed ? !!managementAnchor : managementOpen
                }
                aria-controls={
                  desktop && collapsed
                    ? managementAnchor
                      ? 'management-flyout'
                      : undefined
                    : 'management-links'
                }
                aria-haspopup={desktop && collapsed ? 'menu' : undefined}
                onClick={event =>
                  desktop && collapsed
                    ? setManagementAnchor(event.currentTarget)
                    : setManagementOpen(value => !value)
                }
              >
                {desktop && collapsed ? (
                  <BusinessIcon />
                ) : (
                  <>
                    <ListItemText primary="Tenant Management" />
                    {managementOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </>
                )}
              </ListItemButton>
            </Tooltip>
            <Collapse
              id="management-links"
              in={!(desktop && collapsed) && managementOpen}
            >
              <List disablePadding sx={{ pl: 2 }}>
                <ListItemButton
                  component={Link}
                  to="/management/tenants"
                  selected={scope.central && !scope.portalUsers}
                  onClick={closeMenu}
                  sx={activeNavigationStyles}
                  aria-label="Tenants"
                  aria-current={
                    scope.central && !scope.portalUsers ? 'page' : undefined
                  }
                >
                  <BusinessIcon />
                  {!(desktop && collapsed) && (
                    <ListItemText primary="Tenants" />
                  )}
                </ListItemButton>
                <ListItemButton
                  component={Link}
                  to="/management/portal-users"
                  selected={scope.central && scope.portalUsers}
                  onClick={closeMenu}
                  sx={activeNavigationStyles}
                  aria-label="Portal users"
                  aria-current={
                    scope.central && scope.portalUsers ? 'page' : undefined
                  }
                >
                  <PeopleIcon />
                  {!(desktop && collapsed) && (
                    <ListItemText primary="Portal users" />
                  )}
                </ListItemButton>
              </List>
            </Collapse>
            <Menu
              id="management-flyout"
              anchorEl={managementAnchor}
              open={!!managementAnchor && desktop && collapsed}
              onClose={() => setManagementAnchor(null)}
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            >
              <MenuItem
                component={Link}
                to="/management/tenants"
                selected={scope.central && !scope.portalUsers}
                onClick={closeMenu}
              >
                Tenants
              </MenuItem>
              <MenuItem
                component={Link}
                to="/management/portal-users"
                selected={scope.central && scope.portalUsers}
                onClick={closeMenu}
              >
                Portal users
              </MenuItem>
            </Menu>
          </>
        )}
        {employees && (
          <>
            {!(desktop && collapsed) && (
              <Typography component="div" variant="overline" sx={{ px: 2 }}>
                Accounting
              </Typography>
            )}
            <ListItemButton
              component={Link}
              to={directory}
              selected={scope.directory}
              onClick={closeMenu}
              sx={activeNavigationStyles}
              aria-label="Directories"
              aria-current={scope.directory ? 'page' : undefined}
            >
              <FolderIcon />
              {!(desktop && collapsed) && (
                <ListItemText primary="Directories" />
              )}
            </ListItemButton>
          </>
        )}
      </List>
      <Box sx={railBrandStyles}>
        <Wordmark />
      </Box>
    </Box>
  );
  return (
    <ShellContext value={{ ...scope, employees: !!employees }}>
      <Box
        sx={{
          height: scope.central ? '100dvh' : undefined,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box component="a" href="#product-content" sx={skipLinkStyles}>
          Skip to content
        </Box>
        <AppBar position="static" color="default">
          <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
            <IconButton
              ref={trigger}
              aria-label="Toggle navigation"
              aria-controls="product-navigation"
              aria-expanded={desktop ? !collapsed : open}
              onClick={() =>
                desktop ? setCollapsed(v => !v) : setOpen(v => !v)
              }
            >
              <MenuIcon />
            </IconButton>
            <Typography sx={{ flex: 1 }}>
              {session.tenantName ?? session.tenantCode ?? 'Tenant Management'}
            </Typography>
            {session.canChangeTenant && !session.controlledAccess && (
              <Button component={Link} to="/tenants">
                Change tenant
              </Button>
            )}
            <IconButton
              id="profile-trigger"
              aria-label={`Profile: ${session.email}`}
              aria-haspopup="menu"
              aria-controls={profileAnchor ? 'profile-menu' : undefined}
              aria-expanded={!!profileAnchor}
              onClick={event => setProfileAnchor(event.currentTarget)}
            >
              <Avatar>{session.email.trim().charAt(0).toUpperCase()}</Avatar>
            </IconButton>
            <Menu
              id="profile-menu"
              anchorEl={profileAnchor}
              open={!!profileAnchor}
              onClose={closeProfile}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{ list: { 'aria-labelledby': 'profile-trigger' } }}
            >
              {modeMenu
                ? (['light', 'dark', 'system'] as const).map(mode => (
                    <MenuItem
                      key={mode}
                      role="menuitemradio"
                      aria-checked={preference === mode}
                      selected={preference === mode}
                      onClick={() => {
                        setPreference(mode);
                        closeProfile();
                      }}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </MenuItem>
                  ))
                : [
                    <MenuItem key="profile" disabled>
                      Profile
                    </MenuItem>,
                    <MenuItem key="settings" disabled>
                      Settings
                    </MenuItem>,
                    <MenuItem key="mode" onClick={() => setModeMenu(true)}>
                      <ListItemText primary="Mode" />
                      <ChevronRightIcon />
                    </MenuItem>,
                    <MenuItem
                      key="password"
                      component={Link}
                      to={`/account/password?next=${encodeURIComponent(here)}`}
                      onClick={closeProfile}
                    >
                      Change password
                    </MenuItem>,
                    <MenuItem
                      key="logout"
                      onClick={() => {
                        closeProfile();
                        void signOut();
                      }}
                    >
                      Logout
                    </MenuItem>,
                  ]}
            </Menu>
          </Toolbar>
        </AppBar>
        <Box sx={shellBodyStyles}>
          <Drawer
            variant={desktop ? 'permanent' : 'temporary'}
            open={desktop || open}
            onClose={closeMenu}
            sx={railStyles(desktop && collapsed)}
          >
            {links}
          </Drawer>
          <Box
            component="main"
            id="product-content"
            tabIndex={-1}
            sx={
              scope.central
                ? { ...shellContentStyles, p: 0 }
                : shellContentStyles
            }
          >
            <Stack
              spacing={scope.central ? 0 : 3}
              sx={{ minHeight: 0, height: '100%' }}
            >
              {!scope.central && (
                <Typography component="h1" variant="h4">
                  {heading}
                </Typography>
              )}
              {denied ? (
                <Alert severity="warning">
                  Access is unavailable.{' '}
                  <Button onClick={reload}>Recheck access</Button>
                </Alert>
              ) : failure ? (
                <Alert severity="error">
                  {failure} <Button onClick={reload}>Retry</Button>
                </Alert>
              ) : transition.state === 'loading' ||
                (!scope.central && !navigation) ? (
                <RouteLoading />
              ) : (
                <Outlet
                  key={`${location.pathname}:${scope.record ?? ''}:${scope.target ?? ''}`}
                />
              )}
            </Stack>
          </Box>
        </Box>
      </Box>
    </ShellContext>
  );
}
