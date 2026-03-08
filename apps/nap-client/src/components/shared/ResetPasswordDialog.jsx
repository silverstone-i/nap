/**
 * @file Admin password reset dialog for employee app users
 * @module nap-client/components/shared/ResetPasswordDialog
 *
 * Props:
 *   open          – controls dialog visibility
 *   onClose       – called on cancel / backdrop click
 *   onSuccess     – called after successful reset
 *   employeeId    – UUID of the employee whose app-user password is being reset
 *   employeeName  – display name for the dialog title
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
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
import { useResetEmployeePassword } from '../../hooks/useEmployees.js';

/* ── Password strength rules (mirrored from server) ─────────── */

const RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'A digit', test: (p) => /[0-9]/.test(p) },
  { label: 'A special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export default function ResetPasswordDialog({ open, onClose, onSuccess, employeeId, employeeName }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const resetMut = useResetEmployeePassword();

  const ruleResults = useMemo(() => RULES.map((r) => ({ ...r, pass: r.test(password) })), [password]);
  const allRulesPass = ruleResults.every((r) => r.pass);
  const passwordsMatch = password && password === confirmPassword;
  const canSubmit = password && confirmPassword && allRulesPass && passwordsMatch;

  const reset = () => {
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await resetMut.mutateAsync({ id: employeeId, password });
      reset();
      onSuccess?.();
    } catch (err) {
      setError(err.payload?.message || err.message || 'Failed to reset password');
    }
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth disableRestoreFocus>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
        <span>Reset Password</span>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <Button size="small" onClick={handleClose} disabled={resetMut.isPending}>
            Cancel
          </Button>
          <Button
            size="small"
            type="submit"
            form="reset-password-form"
            variant="contained"
            disabled={!canSubmit || resetMut.isPending}
          >
            {resetMut.isPending ? <CircularProgress size={16} color="inherit" /> : 'Reset Password'}
          </Button>
        </Box>
      </DialogTitle>
      <DialogContent>
        {employeeName && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Set a new password for {employeeName}.
          </Typography>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          component="form"
          id="reset-password-form"
          onSubmit={handleSubmit}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <PasswordField
            label="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
