/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback, useEffect, useState } from 'react';
import { settingDefaults } from '@nap/shared';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ApiError } from '../../api/client.js';
import {
  getGeneralSettings,
  updateGeneralSettings,
} from '../../api/endpoints.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { useEffectiveSettings } from '../../shell/EffectiveSettingsContext.jsx';
import { useNotice } from '../../shell/NoticeContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { LogoSettings } from './LogoSettings.jsx';
import { SettingControl } from './SettingControl.jsx';
import { SETTING_LABELS as LABELS } from './settingLabels.js';

const DEFAULTS = settingDefaults();

const MESSAGES = {
  STALE_REVISION:
    'Someone else changed these settings. They have been reloaded; try again.',
  INVALID_INPUT: 'One of the values is not allowed.',
  FORBIDDEN: 'You do not have permission to change these settings.',
};

/**
 * @param {unknown} err
 * @returns {string}
 */
function describe(err) {
  return (
    (err instanceof ApiError && MESSAGES[err.code]) ||
    'The settings could not be saved. Try again.'
  );
}

const ORDER = Object.keys(LABELS);

/**
 * `/settings/general` (M0006-01-R010): the tenant's general settings. Each
 * setting shows its value and says when it is the default. A member with
 * `general::write` edits and saves them, or resets one to its default;
 * without it the screen is read-only. On `STALE_REVISION` the form reloads.
 * The same member manages the tenant logo above the form (M0006-02-R013).
 * @returns {JSX.Element}
 */
export function GeneralSettingsPage() {
  const tenant = useSession().selectedTenant;
  const { can, onError } = useCapabilities();
  const canWrite = can('tenant-settings::general::write');
  const notify = useNotice();
  const { refresh } = useEffectiveSettings();
  const [loaded, setLoaded] = useState(null);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const view = await getGeneralSettings();
    setLoaded(view);
    setDraft({});
    return view;
  }, []);

  useEffect(() => {
    if (!tenant) return undefined;
    let live = true;
    getGeneralSettings()
      .then(view => live && setLoaded(view))
      .catch(err => live && setError(describe(err)));
    return () => {
      live = false;
    };
  }, [tenant]);

  usePageHeader({ title: 'General' });

  if (!tenant)
    return (
      <Alert severity="info">
        Select a tenant to see its general settings.
      </Alert>
    );
  if (!loaded)
    return error ? (
      <Alert severity="error">{error}</Alert>
    ) : (
      <CircularProgress aria-label="Loading settings" />
    );

  // A draft entry is a new value, or `null` to reset to the default.
  const valueOf = name =>
    name in draft
      ? (draft[name] ?? DEFAULTS[name])
      : loaded.settings[name].value;
  const isDefault = name =>
    name in draft ? draft[name] === null : !loaded.settings[name].stored;
  const changes = Object.fromEntries(
    Object.entries(draft).filter(([name, value]) =>
      value === null
        ? loaded.settings[name].stored
        : value !== loaded.settings[name].value
    )
  );
  const dirty = Object.keys(changes).length > 0;

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const view = await updateGeneralSettings({
        settings: changes,
        revision: loaded.revision,
      });
      setLoaded(view);
      setDraft({});
      refresh();
      notify('Settings saved.');
    } catch (err) {
      onError(err);
      setError(describe(err));
      if (err instanceof ApiError && err.code === 'STALE_REVISION')
        await load().catch(reloadErr => setError(describe(reloadErr)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {canWrite ? <LogoSettings /> : null}
      <Box component="form" onSubmit={save} sx={{ maxWidth: 560 }}>
        <Stack spacing={2.5}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {!canWrite ? (
            <Alert severity="info">
              You can view these settings but not change them.
            </Alert>
          ) : null}
          {ORDER.map(name => (
            <Stack key={name} spacing={0.5}>
              <SettingControl
                name={name}
                value={valueOf(name)}
                onChange={value => setDraft(d => ({ ...d, [name]: value }))}
                disabled={!canWrite || saving}
              />
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', minHeight: 28 }}
              >
                {isDefault(name) ? (
                  <Typography variant="caption" color="text.secondary">
                    Default
                  </Typography>
                ) : null}
                {canWrite && !isDefault(name) ? (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setDraft(d => ({ ...d, [name]: null }))}
                    aria-label={`Reset ${LABELS[name]} to default`}
                  >
                    Reset to default
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          ))}
          {canWrite ? (
            <Box>
              <Button
                type="submit"
                variant="contained"
                disabled={!dirty || saving}
              >
                Save
              </Button>
            </Box>
          ) : null}
        </Stack>
      </Box>
    </>
  );
}
