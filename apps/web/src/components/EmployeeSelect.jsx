/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { listDirectoryPage } from '../api/endpoints.js';

/**
 * Pick one active employee, searched on the server as the user types. The
 * chosen employee stays an option while another search is shown.
 * @param {{label: string, value: {id: string, firstName: string, lastName: string}|null, onChange: (row: object|null) => void, onError?: (err: unknown) => void, required?: boolean}} props
 * @returns {JSX.Element}
 */
export function EmployeeSelect({ label, value, onChange, onError, required }) {
  const [search, setSearch] = useState('');
  const [found, setFound] = useState(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      listDirectoryPage('people', {
        kind: 'employee',
        q: search.trim(),
        limit: 25,
      })
        .then(page => live && setFound({ search, rows: page.rows }))
        .catch(err => live && onError?.(err));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, onError]);
  const options = found?.search === search ? found.rows : [];
  const withChosen =
    value && !options.some(row => row.id === value.id)
      ? [value, ...options]
      : options;

  return (
    <Autocomplete
      options={withChosen}
      loading={found?.search !== search}
      value={value}
      onChange={(_event, row) => onChange(row)}
      inputValue={search}
      onInputChange={(_event, text) => setSearch(text)}
      filterOptions={rows => rows}
      getOptionLabel={row => `${row.firstName} ${row.lastName}`}
      isOptionEqualToValue={(option, chosen) => option.id === chosen.id}
      renderInput={params => (
        <TextField {...params} label={label} required={required} />
      )}
    />
  );
}
