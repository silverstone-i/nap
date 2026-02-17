/**
 * @file Reusable form dialog wrapper
 * @module nap-client/components/shared/FormDialog
 *
 * Wraps children in a Dialog with a <form> element, Cancel and Submit buttons.
 * Pages inject TextField / Select controls as children.
 * DialogContent uses dividers; vertical gap via flex-column + gap token.
 * Padding handled by MuiDialogContent theme overrides.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';

const contentSx = { display: 'flex', flexDirection: 'column', gap: 2 };

export default function FormDialog({
  open,
  title,
  maxWidth = 'sm',
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  loading = false,
  submitDisabled = false,
  onSubmit,
  onCancel,
  children,
}) {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth={maxWidth} fullWidth disableRestoreFocus>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
          <span>{title}</span>
          <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
            <Button size="small" onClick={onCancel} disabled={loading}>
              {cancelLabel}
            </Button>
            <Button
              size="small"
              type="submit"
              variant="contained"
              disabled={loading || submitDisabled}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {submitLabel}
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={contentSx}>
          {children}
        </DialogContent>
      </form>
    </Dialog>
  );
}
