/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  DATE_FORMATS,
  LANGUAGES,
  RECORDS_PER_PAGE,
  TIME_ZONES,
} from '@nap/shared';
import Autocomplete from '@mui/material/Autocomplete';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { CountrySelect } from '../../components/CountrySelect.jsx';
import { CurrencySelect } from '../../components/CurrencySelect.jsx';
import { LANGUAGE_NAMES } from './settingLabels.js';

/**
 * The control for one general setting, used by Settings → General and the
 * member's Profile (M0006-01-R010, M0006-03-R006).
 * @param {{name: string, value: unknown, onChange: (value: unknown) => void, disabled: boolean}} props
 * @returns {JSX.Element}
 */
export function SettingControl({ name, value, onChange, disabled }) {
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
