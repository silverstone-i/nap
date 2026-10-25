/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback, useEffect, useState } from 'react';
import {
  DATE_FORMATS,
  LANGUAGES,
  RECORDS_PER_PAGE,
  settingDefaults,
  TIME_ZONES,
} from '@nap/shared';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ApiError } from '../../api/client.js';
import {
  getGeneralSettings,
  updateGeneralSettings,
} from '../../api/endpoints.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { CountrySelect } from '../../components/CountrySelect.jsx';
import { CurrencySelect } from '../../components/CurrencySelect.jsx';
import { useEffectiveSettings } from '../../shell/EffectiveSettingsContext.jsx';
import { useNotice } from '../../shell/NoticeContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';

const LANGUAGE_NAMES = { en: 'English' };

const DEFAULTS = settingDefaults();

/** Display name of each setting, in screen order. */
const LABELS = {
  defaultCountry: 'Default country',
  currency: 'Currency',
  timeZone: 'Time zone',
  dateFormat: 'Date format',
  language: 'Language',
  recordsPerPage: 'Records per page',
};

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

/**
 * The control for one setting.
 * @param {{name: string, value: unknown, onChange: (value: unknown) => void, disabled: boolean}} props
 * @returns {JSX.Element}
 */
function SettingControl({ name, value, onChange, disabled }) {
  switch (name) {
    case 'defaultCountry':
      return (
        <CountrySelect
          label="Default country"
          value={value}
          onChange={code => code && onChange(code)}
          disabled={disabled}
        />
      );
    case 'currency':
      return (
        <CurrencySelect
          value={value}
          onChange={code => code && onChange(code)}
          disabled={disabled}
        />
      );
    case 'timeZone':
      return (
        <Autocomplete
          options={TIME_ZONES}
          value={value}
          onChange={(_event, zone) => zone && onChange(zone)}
          disableClearable
          disabled={disabled}
          renderInput={params => <TextField {...params} label="Time zone" />}
        />
      );
    case 'dateFormat':
      return (
        <TextField
          select
          label="Date format"
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
        >
          {DATE_FORMATS.map(format => (
            <MenuItem key={format} value={format}>
              {format}
            </MenuItem>
          ))}
        </TextField>
      );
    case 'language':
      return (
        <TextField
          select
          label="Language"
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
        >
          {LANGUAGES.map(code => (
            <MenuItem key={code} value={code}>
              {LANGUAGE_NAMES[code] ?? code}
            </MenuItem>
          ))}
        </TextField>
      );
    case 'recordsPerPage':
      return (
        <TextField
          select
          label="Records per page"
          value={value}
          onChange={event => onChange(Number(event.target.value))}
          disabled={disabled}
        >
          {RECORDS_PER_PAGE.map(size => (
            <MenuItem key={size} value={size}>
              {size}
            </MenuItem>
          ))}
        </TextField>
      );
    default:
      return null;
  }
}

const ORDER = Object.keys(LABELS);

/**
 * `/settings/general` (M0006-01-R010): the tenant's general settings. Each
 * setting shows its value and says when it is the default. A member with
 * `general::write` edits and saves them, or resets one to its default;
 * without it the screen is read-only. On `STALE_REVISION` the form reloads.
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
  );
}
