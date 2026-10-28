/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import { formatTaxIdInput } from '@nap/shared';
import Autocomplete from '@mui/material/Autocomplete';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { Link as RouterLink } from 'react-router';
import { listRoles } from '../../api/endpoints.js';
import { FormattedField } from '../../components/FormattedField.jsx';
import { ArchivedConflictMessage } from '../../grid/ArchivedConflictMessage.jsx';
import { KIND_LABELS } from './directoryRecords.js';
import { relayTaxId } from './useTaxIdFormats.js';

/**
 * The refusal of a tax ID another record of the same kind holds, with a
 * link that opens that record, or opens it in the Archived view where it
 * can be restored (M0005-R048).
 * @param {{kind: string, holder: {id: string, archived: boolean}, onFollow: () => void}} props
 * @returns {JSX.Element}
 */
export function DuplicateTaxIdMessage({ kind, holder, onFollow }) {
  const message = `Another ${KIND_LABELS[kind].toLowerCase()} already has this tax ID.`;
  const params = new URLSearchParams(
    holder.archived
      ? { view: 'archived', open: holder.id }
      : { open: holder.id }
  );
  const to = `/directory/${kind}s?${params}`;
  if (holder.archived)
    return (
      <ArchivedConflictMessage message={message} to={to} onFollow={onFollow} />
    );
  return (
    <>
      {message}{' '}
      <Link component={RouterLink} to={to} onClick={onFollow}>
        Open it
      </Link>
    </>
  );
}

/**
 * A choice of the tenant's active tax ID formats (M0005-R043).
 * @param {{formats: object[]|null, value: string, onChange: (id: string) => void, label?: string, disabled?: boolean}} props
 * @returns {JSX.Element}
 */
export function TaxIdFormatSelect({
  formats,
  value,
  onChange,
  label = 'Tax ID format',
  disabled,
}) {
  const options = (formats ?? []).filter(f => !f.archived);
  return (
    <TextField
      select
      label={label}
      value={options.some(f => f.id === value) ? value : ''}
      onChange={event => onChange(event.target.value)}
      disabled={disabled || formats === null}
      sx={{ minWidth: 160 }}
    >
      {options.map(f => (
        <MenuItem key={f.id} value={f.id}>
          {`${f.country} ${f.name}`}
        </MenuItem>
      ))}
    </TextField>
  );
}

/**
 * A tax ID typed into its format's mask (M0005-R038): `333224444` reads
 * `333-22-4444` as it is typed. Without a mask the value is taken as typed.
 * @param {{label?: string, mask: string|undefined, value: string, onChange: (value: string) => void}} props
 * @returns {JSX.Element}
 */
export function TaxIdField({ label = 'Tax ID', mask, value, onChange }) {
  return (
    <FormattedField
      label={label}
      value={value}
      onChange={onChange}
      format={input => (mask ? formatTaxIdInput(input, mask) : input)}
      placeholder={mask}
      required
      fullWidth
      autoComplete="off"
    />
  );
}

/**
 * A tax ID with its format (M0005-R038, R043). Choosing another format moves
 * what was typed into the new mask.
 * @param {{label?: string, value: string, onChange: (v: string) => void, formats: object[]|null, formatId: string, onFormatChange: (id: string) => void}} props
 * @returns {JSX.Element}
 */
export function TaxIdInput({
  label,
  value,
  onChange,
  formats,
  formatId,
  onFormatChange,
}) {
  const maskOf = id => formats?.find(f => f.id === id)?.mask;
  const mask = maskOf(formatId);
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <TaxIdFormatSelect
        formats={formats}
        value={formatId}
        onChange={id => {
          onFormatChange(id);
          onChange(relayTaxId(value, mask, maskOf(id)));
        }}
      />
      <TaxIdField label={label} mask={mask} value={value} onChange={onChange} />
    </Stack>
  );
}

/**
 * The tenant's unarchived roles to choose from (I0010-R002). The server
 * still refuses a role the session cannot assign (M0003-R011).
 * @param {{value: string[], onChange: (ids: string[]) => void, current: {id: string, name: string}[]}} props
 * @returns {JSX.Element}
 */
export function RolesSelect({ value, onChange, current }) {
  const [roles, setRoles] = useState(null);
  useEffect(() => {
    let live = true;
    listRoles()
      .then(rows => live && setRoles(rows.filter(role => !role.archived)))
      .catch(() => live && setRoles([]));
    return () => {
      live = false;
    };
  }, []);
  // A role the person already holds stays listed even if it was archived.
  const options = [
    ...(roles ?? []),
    ...current.filter(role => !(roles ?? []).some(r => r.id === role.id)),
  ];
  return (
    <Autocomplete
      multiple
      loading={roles === null}
      options={options}
      getOptionLabel={role => role.name}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      value={options.filter(role => value.includes(role.id))}
      onChange={(_event, selected) => onChange(selected.map(role => role.id))}
      renderInput={params => <TextField {...params} label="Roles" />}
    />
  );
}
