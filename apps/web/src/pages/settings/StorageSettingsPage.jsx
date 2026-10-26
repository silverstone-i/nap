/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ApiError } from '../../api/client.js';
import { deleteStorage, getStorage, saveStorage } from '../../api/endpoints.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { PasswordField } from '../../components/PasswordField.jsx';
import { ConfirmDialog } from '../../grid/ConfirmDialog.jsx';
import { useEffectiveSettings } from '../../shell/EffectiveSettingsContext.jsx';
import { useNotice } from '../../shell/NoticeContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';

const EMPTY = {
  endpoint: '',
  region: '',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
};

/** Why a connection test failed (M0006-02-R004). */
const REASONS = {
  UNREACHABLE:
    'nap could not reach the endpoint. Check the address and that the service is up.',
  ACCESS_DENIED:
    'The bucket refused the access key. Check the access key ID, the secret, and its permissions.',
  BUCKET_NOT_FOUND: 'The bucket was not found. Check its name and region.',
  UNEXPECTED_RESPONSE:
    'The bucket answered in a way nap did not expect. Check the endpoint and region.',
};

const MESSAGES = {
  STALE_REVISION:
    'Someone else changed the storage connection. It has been reloaded; try again.',
  INVALID_INPUT:
    'Check the fields. The endpoint must start with https://, and changing the endpoint or access key ID needs the secret again.',
  FORBIDDEN: 'You do not have permission to change file storage.',
};

/**
 * @param {unknown} err
 * @returns {string}
 */
function describe(err) {
  if (err instanceof ApiError) {
    if (err.code === 'STORAGE_TEST_FAILED')
      return `The connection test failed. ${REASONS[err.reason] ?? REASONS.UNEXPECTED_RESPONSE}`;
    if (MESSAGES[err.code]) return MESSAGES[err.code];
  }
  return 'The storage connection could not be saved. Try again.';
}

/**
 * The form's values for a saved connection, with the secret left blank.
 * @param {object|null} view
 * @returns {typeof EMPTY}
 */
function formFor(view) {
  return view
    ? {
        endpoint: view.endpoint,
        region: view.region,
        bucket: view.bucket,
        accessKeyId: view.accessKeyId,
        secretAccessKey: '',
      }
    : EMPTY;
}

/**
 * `/settings/storage` (M0006-02-R015): the tenant's S3-compatible bucket.
 * It shows the connection without its secret. A member with
 * `storage::write` connects, changes, or disconnects it; saving tests the
 * bucket first. Without that capability the screen is read-only.
 * @returns {JSX.Element}
 */
export function StorageSettingsPage() {
  const tenant = useSession().selectedTenant;
  const { can, onError } = useCapabilities();
  const canWrite = can('tenant-settings::storage::write');
  const notify = useNotice();
  const { refresh } = useEffectiveSettings();
  // `undefined` while loading; `null` when no storage is connected.
  const [view, setView] = useState(undefined);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const show = useCallback(next => {
    setView(next);
    setForm(formFor(next));
  }, []);

  useEffect(() => {
    if (!tenant) return undefined;
    let live = true;
    getStorage()
      .then(next => live && show(next))
      .catch(() => live && setError('File storage could not be loaded.'));
    return () => {
      live = false;
    };
  }, [tenant, show]);

  usePageHeader({ title: 'Storage' });

  if (!tenant)
    return (
      <Alert severity="info">Select a tenant to see its file storage.</Alert>
    );
  if (view === undefined)
    return error ? (
      <Alert severity="error">{error}</Alert>
    ) : (
      <CircularProgress aria-label="Loading storage" />
    );

  // R005: a new endpoint or access key needs the secret again.
  const secretRequired =
    !view ||
    form.endpoint.trim() !== view.endpoint ||
    form.accessKeyId.trim() !== view.accessKeyId;
  const set = name => event =>
    setForm(f => ({ ...f, [name]: event.target.value }));

  async function reload() {
    show(await getStorage());
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const secret = form.secretAccessKey;
      const next = await saveStorage({
        endpoint: form.endpoint.trim(),
        region: form.region.trim(),
        bucket: form.bucket.trim(),
        accessKeyId: form.accessKeyId.trim(),
        ...(secret ? { secretAccessKey: secret } : {}),
        revision: view?.revision ?? null,
      });
      show(next);
      refresh();
      notify(view ? 'Storage connection saved.' : 'Storage connected.');
    } catch (err) {
      onError(err);
      setError(describe(err));
      if (err instanceof ApiError && err.code === 'STALE_REVISION')
        await reload().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setConfirming(false);
    setSaving(true);
    setError(null);
    try {
      await deleteStorage(view.revision);
      show(null);
      refresh();
      notify('Storage disconnected.');
    } catch (err) {
      onError(err);
      setError(describe(err));
      if (err instanceof ApiError && err.code === 'STALE_REVISION')
        await reload().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  // M0006-02-R017: without write access, the connection is plain text.
  if (!canWrite)
    return (
      <Stack spacing={1} sx={{ maxWidth: 560 }}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {view ? (
          [
            ['Endpoint', view.endpoint],
            ['Region', view.region],
            ['Bucket', view.bucket],
            ['Access key ID', view.accessKeyId],
          ].map(([label, value]) => (
            <Typography key={label} variant="body2">
              {label}: {value}
            </Typography>
          ))
        ) : (
          <Typography variant="body2">No file storage is connected.</Typography>
        )}
      </Stack>
    );

  return (
    <Box component="form" onSubmit={save} sx={{ maxWidth: 560 }}>
      <Stack spacing={2.5}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <TextField
          label="Endpoint"
          value={form.endpoint}
          onChange={set('endpoint')}
          placeholder="https://<account>.r2.cloudflarestorage.com"
          required
          disabled={saving}
        />
        <TextField
          label="Region"
          value={form.region}
          onChange={set('region')}
          required
          disabled={saving}
        />
        <TextField
          label="Bucket"
          value={form.bucket}
          onChange={set('bucket')}
          required
          disabled={saving}
        />
        <TextField
          label="Access key ID"
          value={form.accessKeyId}
          onChange={set('accessKeyId')}
          autoComplete="off"
          required
          disabled={saving}
        />
        {/* M0006-02-R018: a saved secret shows as a placeholder; R005 alone asks for it again. */}
        <PasswordField
          label="Secret access key"
          value={form.secretAccessKey}
          onChange={set('secretAccessKey')}
          autoComplete="new-password"
          required={secretRequired}
          disabled={saving}
          placeholder={view && !secretRequired ? 'Saved' : undefined}
          helperText={view && secretRequired ? 'Enter the secret again.' : ''}
        />
        <Stack direction="row" spacing={1}>
          <Button type="submit" variant="contained" disabled={saving}>
            {view ? 'Test and save' : 'Test and connect'}
          </Button>
          {view ? (
            <Button
              color="error"
              onClick={() => setConfirming(true)}
              disabled={saving}
            >
              Disconnect
            </Button>
          ) : null}
        </Stack>
      </Stack>
      {/* M0006-02-R016: the shared confirmation. */}
      <ConfirmDialog
        open={confirming}
        title="Disconnect storage?"
        description="Files stay in the bucket."
        confirmLabel="Disconnect"
        onConfirm={disconnect}
        onCancel={() => setConfirming(false)}
      />
    </Box>
  );
}
