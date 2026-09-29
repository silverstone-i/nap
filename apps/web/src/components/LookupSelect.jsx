/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';

/**
 * A searchable picker over one reference-data list (M0004-R009). The user
 * filters by name or code; `value` and `onChange` use the code only.
 * @param {{load: () => Promise<{code: string, name: string}[]>, label: string, value: string|null, onChange: (code: string|null) => void, disabled?: boolean, required?: boolean, error?: boolean, helperText?: import('react').ReactNode}} props
 * @returns {JSX.Element}
 */
export function LookupSelect({
  load,
  label,
  value,
  onChange,
  disabled,
  required,
  error,
  helperText,
}) {
  const [options, setOptions] = useState([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    load()
      .then(rows => !cancelled && setOptions(rows))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [load]);

  const selected = options.find(o => o.code === value) ?? null;
  return (
    <Autocomplete
      options={options}
      value={selected}
      loading={loading}
      disabled={disabled}
      onChange={(_event, option) => onChange(option?.code ?? null)}
      getOptionLabel={option => `${option.name} (${option.code})`}
      isOptionEqualToValue={(option, current) => option.code === current.code}
      filterOptions={(list, { inputValue }) => {
        const query = inputValue.trim().toLowerCase();
        return query
          ? list.filter(
              o =>
                o.code.toLowerCase().startsWith(query) ||
                o.name.toLowerCase().includes(query)
            )
          : list;
      }}
      renderInput={params => (
        <TextField
          {...params}
          label={label}
          required={required}
          error={error || failed}
          helperText={failed ? 'Could not load the list' : helperText}
        />
      )}
    />
  );
}
