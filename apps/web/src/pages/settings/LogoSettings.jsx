/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { IMAGE_TYPES, MAX_FILE_BYTES } from '@nap/shared';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ApiError } from '../../api/client.js';
import { deleteLogo, uploadLogo } from '../../api/endpoints.js';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { useEffectiveSettings } from '../../shell/EffectiveSettingsContext.jsx';
import { useNotice } from '../../shell/NoticeContext.jsx';
import { TenantLogo } from '../../shell/TenantLogo.jsx';
import { ConfirmDialog } from '../../grid/ConfirmDialog.jsx';
import { BRAND_TOKENS } from '../../theme/tokens.js';

const INVALID =
  'The logo must be a PNG, JPEG, WebP, or GIF image of at most 2 MB.';

const MESSAGES = {
  INVALID_INPUT: INVALID,
  STORAGE_NOT_CONFIGURED: 'Connect file storage before uploading a logo.',
  STORAGE_UNAVAILABLE:
    'File storage could not be reached. Check Settings → Storage and try again.',
  NOT_FOUND: 'The logo was already removed.',
  FORBIDDEN: 'You do not have permission to change the logo.',
};

/**
 * @param {unknown} err
 * @returns {string}
 */
function describe(err) {
  return (
    (err instanceof ApiError && MESSAGES[err.code]) ||
    'The logo could not be changed. Try again.'
  );
}

const VARIANTS = [
  { variant: 'light', label: 'Light theme' },
  { variant: 'dark', label: 'Dark theme' },
];

/**
 * One logo variant: its preview on that theme's card color, and its Upload,
 * Replace, and Remove controls (M0006-04-R006, R007). `busy` is shared by
 * both items, so only one logo change runs at a time.
 * @param {{variant: 'light'|'dark', label: string, fileId: string|null, busy: boolean, setBusy: (busy: boolean) => void}} props
 * @returns {JSX.Element}
 */
function LogoItem({ variant, label, fileId, busy, setBusy }) {
  const { refresh } = useEffectiveSettings();
  const { onError } = useCapabilities();
  const notify = useNotice();
  const [error, setError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const tokens = BRAND_TOKENS[variant];

  async function change(operation, message) {
    setBusy(true);
    setError(null);
    try {
      await operation();
      refresh();
      notify(message);
    } catch (err) {
      onError(err);
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_FILE_BYTES) {
      setError(INVALID);
      return;
    }
    void change(() => uploadLogo(variant, file), 'Logo saved.');
  }

  return (
    <Stack spacing={1}>
      <Typography variant="body2">{label}</Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {fileId ? (
        <Box
          sx={{
            alignSelf: 'flex-start',
            p: 2,
            borderRadius: 1,
            border: 1,
            borderColor: tokens.border,
            bgcolor: tokens.card,
          }}
        >
          <TenantLogo fileId={fileId} height={64} alt={`${label} logo`} />
        </Box>
      ) : null}
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" component="label" disabled={busy}>
          {fileId ? 'Replace' : 'Upload'}
          <input
            hidden
            type="file"
            accept={IMAGE_TYPES.join(',')}
            aria-label={`${label} logo file`}
            onChange={choose}
          />
        </Button>
        {fileId ? (
          <Button
            color="error"
            disabled={busy}
            onClick={() => setConfirmRemove(true)}
          >
            Remove
          </Button>
        ) : null}
      </Stack>
      {/* M0006-04-R007: each removal asks first, naming its theme. */}
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${label.toLowerCase()} logo?`}
        confirmLabel="Remove"
        onConfirm={() => {
          setConfirmRemove(false);
          void change(() => deleteLogo(variant), 'Logo removed.');
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </Stack>
  );
}

/**
 * The tenant logo controls on Settings → General (M0006-02-R013), for a
 * member with `general::write`: one item per theme (M0006-04-R006). They
 * appear only when file storage is connected.
 * @returns {JSX.Element|null}
 */
export function LogoSettings() {
  const { logoLightFileId, logoDarkFileId, storageConnected } =
    useEffectiveSettings().settings;
  const fileIds = { light: logoLightFileId, dark: logoDarkFileId };
  const [busy, setBusy] = useState(false);

  // M0006-02-R013, R018; M0006-04-R008: the controls exist only while
  // storage is connected, and say nothing about storage, file limits, or the
  // fallback until a file is refused.
  if (!storageConnected) return null;
  return (
    <Stack spacing={2} sx={{ maxWidth: 560, mb: 3 }}>
      <Typography variant="subtitle2">Logo</Typography>
      {VARIANTS.map(({ variant, label }) => (
        <LogoItem
          key={variant}
          variant={variant}
          label={label}
          fileId={fileIds[variant]}
          busy={busy}
          setBusy={setBusy}
        />
      ))}
    </Stack>
  );
}
