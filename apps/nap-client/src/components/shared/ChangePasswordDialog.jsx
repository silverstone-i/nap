/**
 * @file Change Password dialog — current/new/confirm fields with strength feedback
 * @module nap-client/components/shared/ChangePasswordDialog
 *
 * Props:
 *   open       – controls dialog visibility
 *   onClose    – called when cancel/backdrop clicked (ignored when forced)
 *   onSuccess  – called after successful password change
 *   forced     – if true, hides cancel button (used for invited-user first login)
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import PasswordField from './PasswordField.jsx';
import authApi from '../../services/authApi.js';

/* ── Password strength rules (mirrored from server) ─────────── */

const RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'A digit', test: (p) => /[0-9]/.test(p) },
  { label: 'A special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export default function ChangePasswordDialog({ open, onClose, onSuccess, forced = false }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ruleResults = useMemo(() => RULES.map((r) => ({ ...r, pass: r.test(newPassword) })), [newPassword]);
  const allRulesPass = ruleResults.every((r) => r.pass);
  const passwordsMatch = newPassword && newPassword === confirmPassword;
  const canSubmit = currentPassword && newPassword && confirmPassword && allRulesPass && passwordsMatch;

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      reset();
      onSuccess?.();
    } catch (err) {
      setError(err.payload?.message || err.message || 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (forced) return;
    reset();
    onClose?.();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth disableEscapeKeyDown={forced}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
        <span>{forced ? 'Set a New Password' : 'Change Password'}</span>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          {!forced && (
            <Button size="small" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button
            size="small"
            type="submit"
            form="change-password-form"
            variant="contained"
            disabled={!canSubmit || submitting}
          >
            {submitting ? <CircularProgress size={16} color="inherit" /> : 'Change Password'}
          </Button>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {forced && (
          <Alert severity="info" sx={{ mb: 2 }}>
            You must change your password before continuing.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          component="form"
          id="change-password-form"
          onSubmit={handleSubmit}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <PasswordField
            label="Current Password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            fullWidth
            required
            autoComplete="current-password"
            size="small"
          />
          <PasswordField
            label="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            fullWidth
            required
            autoComplete="new-password"
            size="small"
          />
          <PasswordField
            label="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            fullWidth
            required
            autoComplete="new-password"
            size="small"
            error={!!confirmPassword && !passwordsMatch}
            helperText={confirmPassword && !passwordsMatch ? 'Passwords do not match' : ''}
          />

          {/* Strength checklist */}
          <Box sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Password requirements
            </Typography>
            {ruleResults.map((r) => (
              <Box key={r.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                {r.pass ? (
                  <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
                ) : (
                  <CloseIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                )}
                <Typography variant="caption" color={r.pass ? 'success.main' : 'text.secondary'}>
                  {r.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
