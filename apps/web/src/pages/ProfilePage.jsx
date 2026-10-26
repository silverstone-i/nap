/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import {
  DEFAULT_PROFILE_IMAGES,
  IMAGE_TYPES,
  MAX_FILE_BYTES,
  OVERRIDABLE_SETTINGS,
} from '@nap/shared';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ApiError } from '../api/client.js';
import {
  getProfile,
  updateProfile,
  uploadProfileImage,
} from '../api/endpoints.js';
import { useSession } from '../auth/SessionContext.jsx';
import { useEffectiveSettings } from '../shell/EffectiveSettingsContext.jsx';
import { useNotice } from '../shell/NoticeContext.jsx';
import { usePageHeader } from '../shell/PageHeaderContext.jsx';
import { useThemeMode } from '../theme/ThemeModeContext.jsx';
import { initialsFromEmail } from '../shell/initials.js';
import { defaultImageUrl, useProfileImage } from '../shell/useProfileImage.js';
import { SettingControl } from './settings/SettingControl.jsx';
import { describeSetting, SETTING_LABELS } from './settings/settingLabels.js';

const MESSAGES = {
  STALE_REVISION:
    'Your profile changed in another window. It has been reloaded; try again.',
  INVALID_INPUT:
    'The image must be a PNG, JPEG, WebP, or GIF image of at most 2 MB.',
  STORAGE_NOT_CONFIGURED: 'File storage is not connected for this tenant.',
  STORAGE_UNAVAILABLE: 'File storage could not be reached. Try again later.',
  FORBIDDEN: 'Only an active member of this tenant has a profile here.',
};

/**
 * @param {unknown} err
 * @returns {string}
 */
function describe(err) {
  return (
    (err instanceof ApiError && MESSAGES[err.code]) ||
    'Your profile could not be saved. Try again.'
  );
}

/**
 * The member's current image as the shell shows it.
 * @param {{defaultImage: string|null, imageFileId: string|null}} profile
 * @param {boolean} storageConnected
 * @returns {{defaultImage: string}|{fileId: string}|null}
 */
function imageOf(profile, storageConnected) {
  if (profile.defaultImage) return { defaultImage: profile.defaultImage };
  if (profile.imageFileId && storageConnected)
    return { fileId: profile.imageFileId };
  return null;
}

const MODE_LABELS = { dark: 'Dark', light: 'Light', system: 'System' };

/**
 * The display mode, kept in this browser (I0001-R044, R012). It changes the
 * display at once, so it needs no notice.
 * @returns {JSX.Element}
 */
function ThemeField() {
  const { mode, setMode } = useThemeMode();
  return (
    <TextField
      select
      label="Theme"
      value={mode}
      onChange={event => setMode(event.target.value)}
    >
      {Object.entries(MODE_LABELS).map(([value, text]) => (
        <MenuItem key={value} value={value}>
          {text}
        </MenuItem>
      ))}
    </TextField>
  );
}

/**
 * `/profile` (M0006-03-R006, R009–R011, I0001-R044): the display mode, and
 * the signed-in member's profile in the selected tenant. Each overridable
 * setting shows the tenant's value beside the member's own and saves when it
 * changes; "Use tenant setting" removes an override. The profile image is a
 * default image, an upload when storage is connected, or none.
 * @returns {JSX.Element}
 */
export function ProfilePage() {
  const session = useSession();
  const tenant = session.selectedTenant;
  const { settings, refresh } = useEffectiveSettings();
  const notify = useNotice();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const image = useProfileImage(
    profile ? imageOf(profile, settings.storageConnected) : null
  );

  useEffect(() => {
    if (!tenant) return undefined;
    let live = true;
    getProfile()
      .then(view => live && setProfile(view))
      .catch(err => live && setError(describe(err)));
    return () => {
      live = false;
    };
  }, [tenant]);

  usePageHeader({ title: 'Profile' });

  // I0001-R044: the theme belongs to the browser, so it stays in one place
  // without a tenant, while the profile loads, and when it fails to load.
  if (!tenant || !profile)
    return (
      <Stack spacing={3} sx={{ maxWidth: 560 }}>
        <ThemeField />
        {!tenant ? (
          <Alert severity="info">Select a tenant to see your profile.</Alert>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <CircularProgress aria-label="Loading profile" />
        )}
      </Stack>
    );

  /** Run a profile change, show the result, and reload effective values. */
  async function change(operation, message) {
    setBusy(true);
    setError(null);
    try {
      setProfile(await operation());
      refresh();
      notify(message);
    } catch (err) {
      setError(describe(err));
      if (err instanceof ApiError && err.code === 'STALE_REVISION')
        await getProfile()
          .then(setProfile)
          .catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  /**
   * M0006-03-R011: save one setting as soon as it changes; `null` returns it
   * to the tenant's value.
   */
  const saveSetting = (name, value) =>
    change(
      () =>
        updateProfile({
          overrides: { [name]: value },
          revision: profile.revision,
        }),
      'Profile saved.'
    );

  function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_FILE_BYTES) {
      setError(MESSAGES.INVALID_INPUT);
      return;
    }
    void change(() => uploadProfileImage(file), 'Profile image saved.');
  }

  const pickDefault = name =>
    change(
      () => updateProfile({ defaultImage: name, revision: profile.revision }),
      name ? 'Profile image saved.' : 'Profile image removed.'
    );

  return (
    <Stack spacing={3} sx={{ maxWidth: 560 }}>
      <ThemeField />
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Stack spacing={1.5}>
        <Typography variant="subtitle2">Profile image</Typography>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Avatar
            src={image ?? undefined}
            alt="Your profile image"
            sx={{ width: 72, height: 72, bgcolor: 'primary.main' }}
          >
            {initialsFromEmail(session.user?.email ?? '')}
          </Avatar>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {settings.storageConnected ? (
              <Button variant="outlined" component="label" disabled={busy}>
                {profile.imageFileId ? 'Replace image' : 'Upload image'}
                <input
                  hidden
                  type="file"
                  accept={IMAGE_TYPES.join(',')}
                  aria-label="Profile image file"
                  onChange={choose}
                />
              </Button>
            ) : null}
            {/* M0006-03-R009: one control returns to initials; choosing no
                default image also drops an uploaded one (R005). */}
            {profile.imageFileId || profile.defaultImage ? (
              <Button
                color="error"
                disabled={busy}
                onClick={() => pickDefault(null)}
              >
                Remove image
              </Button>
            ) : null}
          </Stack>
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          role="radiogroup"
          aria-label="Default profile images"
          sx={{ flexWrap: 'wrap', rowGap: 1 }}
        >
          {DEFAULT_PROFILE_IMAGES.map(name => {
            const chosen = profile.defaultImage === name;
            return (
              <ButtonBase
                key={name}
                role="radio"
                aria-checked={chosen}
                aria-label={`Default image ${name}`}
                disabled={busy}
                onClick={() => !chosen && pickDefault(name)}
                sx={{
                  borderRadius: '50%',
                  outline: chosen ? 3 : 0,
                  outlineColor: 'primary.main',
                  outlineOffset: 2,
                }}
              >
                <Avatar
                  src={defaultImageUrl(name)}
                  alt=""
                  sx={{ width: 48, height: 48 }}
                />
              </ButtonBase>
            );
          })}
        </Stack>
      </Stack>
      <Stack spacing={2.5}>
        {OVERRIDABLE_SETTINGS.map(name => {
          const own = profile.overrides[name] ?? null;
          const tenantValue = profile.tenantValues[name];
          return (
            <Stack key={name} spacing={0.5}>
              <SettingControl
                name={name}
                value={own ?? tenantValue}
                onChange={value => {
                  if (value !== own) void saveSetting(name, value);
                }}
                disabled={busy}
              />
              {/* M0006-03-R010: the tenant's value shows only beside an
                  override, with the way back to it. */}
              {own !== null ? (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Tenant setting: {describeSetting(name, tenantValue)}
                  </Typography>
                  <Button
                    size="small"
                    variant="text"
                    disabled={busy}
                    onClick={() => void saveSetting(name, null)}
                    aria-label={`Use tenant setting for ${SETTING_LABELS[name]}`}
                  >
                    Use tenant setting
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}
