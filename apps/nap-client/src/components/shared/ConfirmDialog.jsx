/**
 * @file Reusable confirmation dialog
 * @module nap-client/components/shared/ConfirmDialog
 *
 * Generic yes / no dialog for destructive or significant actions.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth disableRestoreFocus>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
        <span>{title}</span>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <Button size="small" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            size="small"
            variant="contained"
            color={confirmColor}
            onClick={onConfirm}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {confirmLabel}
          </Button>
        </Box>
      </DialogTitle>
      <DialogContent>
        {typeof message === 'string' ? (
          <Typography variant="body2" color="text.secondary">
            {message}
          </Typography>
        ) : (
          message
        )}
      </DialogContent>
    </Dialog>
  );
}
