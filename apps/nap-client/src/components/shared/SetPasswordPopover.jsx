/**
 * @file Popover for setting an initial password when is_app_user is toggled ON
 * @module nap-client/components/shared/SetPasswordPopover
 *
 * Appears anchored to the is_app_user checkbox. Pre-fills a random password
 * the admin can copy/share, or edit to their own value. Validates strength
 * before allowing confirm.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

/* ── Password generation ─────────────────────────────────────── */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';

function generatePassword(len = 16) {
  const buf = new Uint8Array(len);
  window.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => CHARS[b % CHARS.length]).join('');
}

/* ── Strength rules (mirrored from server) ───────────────────── */

const RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'A digit', test: (p) => /[0-9]/.test(p) },
  { label: 'A special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export default function SetPasswordPopover({ anchorEl, onConfirm, onCancel }) {
  const open = Boolean(anchorEl);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);

  // Generate a fresh password each time the popover opens
  useEffect(() => {
    if (open) {
      setPassword(generatePassword());
      setCopied(false);
    }
  }, [open]);

  const ruleResults = useMemo(() => RULES.map((r) => ({ ...r, pass: r.test(password) })), [password]);
  const allPass = ruleResults.every((r) => r.pass);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }, [password]);

  const handleRegenerate = useCallback(() => {
    setPassword(generatePassword());
    setCopied(false);
  }, []);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onCancel}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{ paper: { sx: { p: 2, width: 340 } } }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Set initial password
      </Typography>

      <TextField
        value={password}
        onChange={(e) => { setPassword(e.target.value); setCopied(false); }}
        fullWidth
        size="small"
        autoComplete="off"
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                <IconButton size="small" onClick={handleCopy} edge="end">
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Regenerate">
                <IconButton size="small" onClick={handleRegenerate} edge="end">
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        }}
      />

      {/* Strength checklist */}
      <Box sx={{ mt: 1.5 }}>
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

      {/* Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
        <Button size="small" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="small" variant="contained" disabled={!allPass} onClick={() => onConfirm(password)}>
          Set Password
        </Button>
      </Box>
    </Popover>
  );
}
