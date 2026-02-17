/**
 * @file TenantBar — sticky top bar with tenant selector and user avatar dropdown
 * @module nap-client/components/layout/TenantBar
 *
 * Visual styling via theme overrides (MuiAppBar, MuiToolbar, MuiChip, MuiAvatar).
 * Layout positioning via layoutTokens.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Avatar,
  Box,
  Typography,
  Menu,
  MenuItem,
  Divider,
  Chip,
  ListItemIcon,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import LockResetIcon from '@mui/icons-material/LockReset';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tenantBarSx } from '../../config/layoutTokens.js';
import ChangePasswordDialog from '../shared/ChangePasswordDialog.jsx';

function userInitials(user) {
  if (!user) return '?';
  const full = user.full_name || user.user_name || user.email || '';
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return full.slice(0, 2).toUpperCase() || '?';
}

export default function TenantBar() {
  const { user, logout, tenant } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const [changePwOpen, setChangePwOpen] = useState(false);

  const handleMenuOpen = (e) => setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const handleSignOut = async () => {
    handleMenuClose();
    await logout();
    navigate('/login');
  };

  return (
    <AppBar
      position="sticky"
      sx={{ ...tenantBarSx, zIndex: (t) => t.zIndex.appBar }}
    >
      <Toolbar variant="dense" sx={{ px: 2, justifyContent: 'space-between' }}>
        {/* Left: Tenant context */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={tenant?.tenant_code?.toUpperCase() || 'NO TENANT'}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Box>

        {/* Right: User avatar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {user?.full_name || user?.user_name || user?.email || ''}
          </Typography>
          <Avatar variant="header" onClick={handleMenuOpen}>
            {userInitials(user)}
          </Avatar>
        </Box>

        {/* User dropdown menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          slotProps={{ paper: { sx: { minWidth: 220, mt: 1 } } }}
        >
          {/* User info (display only) */}
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {user?.full_name || user?.user_name || 'User'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.email || ''}
            </Typography>
          </Box>
          <Divider />

          <MenuItem
            onClick={() => {
              handleMenuClose();
              navigate('/profile');
            }}
          >
            <ListItemIcon>
              <PersonIcon fontSize="small" />
            </ListItemIcon>
            My Profile
          </MenuItem>

          <MenuItem
            onClick={() => {
              handleMenuClose();
              navigate('/settings');
            }}
          >
            <ListItemIcon>
              <SettingsIcon fontSize="small" />
            </ListItemIcon>
            Settings
          </MenuItem>

          <MenuItem
            onClick={() => {
              handleMenuClose();
              setChangePwOpen(true);
            }}
          >
            <ListItemIcon>
              <LockResetIcon fontSize="small" />
            </ListItemIcon>
            Change Password
          </MenuItem>

          <Divider />

          <MenuItem onClick={handleSignOut}>
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            Sign Out
          </MenuItem>
        </Menu>
      </Toolbar>

      <ChangePasswordDialog
        open={changePwOpen}
        onClose={() => setChangePwOpen(false)}
        onSuccess={() => setChangePwOpen(false)}
      />
    </AppBar>
  );
}
