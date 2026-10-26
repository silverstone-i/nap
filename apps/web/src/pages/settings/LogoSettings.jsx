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

/**
 * The tenant logo control on Settings → General (M0006-02-R013), for a
 * member with `general::write`. Upload and replace appear only when file
 * storage is connected.
 * @returns {JSX.Element}
 */
export function LogoSettings() {
  const { settings, refresh } = useEffectiveSettings();
  const { onError } = useCapabilities();
  const notify = useNotice();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { logoFileId, storageConnected } = settings;

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
    void change(() => uploadLogo(file), 'Logo saved.');
  }

  // M0006-02-R013, R018: the control exists only while storage is connected,
  // and says nothing about storage or file limits until a file is refused.
  if (!storageConnected) return null;
  return (
    <Stack spacing={1} sx={{ maxWidth: 560, mb: 3 }}>
      <Typography variant="subtitle2">Logo</Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {logoFileId ? (
        <Box>
          <TenantLogo fileId={logoFileId} height={64} alt="Tenant logo" />
        </Box>
      ) : null}
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" component="label" disabled={busy}>
          {logoFileId ? 'Replace logo' : 'Upload logo'}
          <input
            hidden
            type="file"
            accept={IMAGE_TYPES.join(',')}
            aria-label="Logo file"
            onChange={choose}
          />
        </Button>
        {logoFileId ? (
          <Button
            color="error"
            disabled={busy}
            onClick={() => setConfirmRemove(true)}
          >
            Remove logo
          </Button>
        ) : null}
      </Stack>
      {/* M0006-02-R016: Remove logo asks first. */}
      <ConfirmDialog
        open={confirmRemove}
        title="Remove logo?"
        confirmLabel="Remove"
        onConfirm={() => {
          setConfirmRemove(false);
          void change(deleteLogo, 'Logo removed.');
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </Stack>
  );
}
