/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { listCapabilities } from '../../api/endpoints.js';

const ANY = '*';

/** A native select, which keeps the picker keyboard- and test-friendly. */
function PartSelect({ label, value, options, onChange }) {
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={event => onChange(event.target.value)}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
      size="small"
      sx={{ minWidth: 140 }}
    >
      <option value={ANY}>* (any)</option>
      {options.map(option => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </TextField>
  );
}

/**
 * Grant picker: module, router, and action come from the catalogue
 * (`GET /capabilities`) or `*`; the tenant part is free text, defaulting
 * to the selected tenant's code (M0003-R003).
 * @param {{tenantCode: string, catalogue: Array<{module: string, router: string, action: string}>, onAdd: (pattern: string) => void}} props
 */
function GrantPicker({ tenantCode, catalogue, onAdd }) {
  const [tenant, setTenant] = useState(tenantCode);
  const [module, setModule] = useState(ANY);
  const [router, setRouter] = useState(ANY);
  const [action, setAction] = useState(ANY);

  const modules = useMemo(
    () => [...new Set(catalogue.map(entry => entry.module))],
    [catalogue]
  );
  const routers = useMemo(
    () => [
      ...new Set(
        catalogue
          .filter(entry => module === ANY || entry.module === module)
          .map(entry => entry.router)
      ),
    ],
    [catalogue, module]
  );
  const actions = useMemo(
    () => [
      ...new Set(
        catalogue
          .filter(entry => module === ANY || entry.module === module)
          .filter(entry => router === ANY || entry.router === router)
          .map(entry => entry.action)
      ),
    ],
    [catalogue, module, router]
  );

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      <TextField
        label="Tenant"
        value={tenant}
        onChange={event => setTenant(event.target.value)}
        helperText="Tenant code or *"
        size="small"
        sx={{ width: 120 }}
      />
      <PartSelect
        label="Module"
        value={module}
        options={modules}
        onChange={value => {
          setModule(value);
          setRouter(ANY);
          setAction(ANY);
        }}
      />
      <PartSelect
        label="Router"
        value={router}
        options={routers}
        onChange={value => {
          setRouter(value);
          setAction(ANY);
        }}
      />
      <PartSelect
        label="Action"
        value={action}
        options={actions}
        onChange={setAction}
      />
      <Button
        variant="outlined"
        size="small"
        disabled={!tenant.trim()}
        onClick={() =>
          onAdd(`${tenant.trim()}::${module}::${router}::${action}`)
        }
      >
        Add grant
      </Button>
    </Stack>
  );
}

/**
 * A role's grants as removable chips, with the picker that adds one
 * (M0003-R003, R019). Loads the capability catalogue itself.
 * @param {{grants: string[], onChange: (grants: string[]) => void, tenantCode: string, onError: (err: unknown) => void}} props
 * @returns {JSX.Element}
 */
export function GrantsField({ grants, onChange, tenantCode, onError }) {
  const [catalogue, setCatalogue] = useState([]);
  useEffect(() => {
    let cancelled = false;
    listCapabilities()
      .then(rows => {
        if (!cancelled) setCatalogue(rows);
      })
      .catch(err => {
        if (!cancelled) onError(err);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);
  return (
    <Stack spacing={2}>
      {grants.length ? (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {grants.map(grant => (
            <Chip
              key={grant}
              label={grant}
              onDelete={() => onChange(grants.filter(item => item !== grant))}
            />
          ))}
        </Stack>
      ) : null}
      <GrantPicker
        tenantCode={tenantCode}
        catalogue={catalogue}
        onAdd={pattern =>
          onChange(grants.includes(pattern) ? grants : [...grants, pattern])
        }
      />
    </Stack>
  );
}
