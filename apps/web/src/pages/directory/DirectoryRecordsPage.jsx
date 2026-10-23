/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router';
import Alert from '@mui/material/Alert';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useSession } from '../../auth/SessionContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { useDebouncedValue } from '../../shell/useDebouncedValue.js';
import { DirectoryGrid } from './DirectoryGrid.jsx';
import { RecordDetailDialog } from './RecordDetailDialog.jsx';
import { RecordFormDialog } from './RecordFormDialog.jsx';
import { useDirectoryAbilities } from './useDirectoryAbilities.js';
import { useDirectoryBulk } from './useDirectoryBulk.js';

/** Per-kind page settings. */
const PAGES = {
  employee: {
    collection: 'people',
    title: 'Employees',
    create: 'New employee',
    empty: 'No employees yet.',
  },
  contact: {
    collection: 'people',
    title: 'Contacts',
    create: 'New contact',
    empty: 'No contacts yet.',
  },
  vendor: {
    collection: 'organizations',
    title: 'Vendors',
    create: 'New vendor',
    empty: 'No vendors yet.',
  },
  client: {
    collection: 'organizations',
    title: 'Clients',
    create: 'New client',
    empty: 'No clients yet.',
  },
};

/**
 * `/directory/employees`, `/directory/contacts`, `/directory/vendors`, and
 * `/directory/clients` (M0005-R026–R029): list and search the selected
 * tenant's records of one kind in a standard grid, open, edit, archive, or
 * restore one or a page of them, or create one. The name search, the filter
 * popover (tax ID with `tax-ids::read`, Include archived), the bulk actions,
 * and the create action sit in the page header (I0001-R028, R029).
 * @param {{kind: 'employee'|'contact'|'vendor'|'client'}} props
 * @returns {JSX.Element}
 */
export function DirectoryRecordsPage({ kind }) {
  const settings = PAGES[kind];
  const { collection } = settings;
  const session = useSession();
  const tenant = session.selectedTenant;
  const abilities = useDirectoryAbilities();
  const [search, setSearch] = useState('');
  const [taxId, setTaxId] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const query = useDebouncedValue(search.trim());
  const taxIdQuery = useDebouncedValue(taxId.trim());
  const [notice, setNotice] = useState(null);
  // `?open=<id>` opens a record on arrival, such as a tenant's client from
  // the Tenants screen.
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState(params.get('open'));
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(key => key + 1);
  const bulk = useDirectoryBulk({ collection, abilities, onDone: reload });

  const chips = [
    taxIdQuery && {
      key: 'taxId',
      label: 'Tax ID',
      onDelete: () => setTaxId(''),
    },
    includeArchived && {
      key: 'archived',
      label: 'Including archived',
      onDelete: () => setIncludeArchived(false),
    },
  ].filter(Boolean);

  usePageHeader({
    title: settings.title,
    search: tenant
      ? {
          value: search,
          onChange: setSearch,
          placeholder: 'Search by name',
          label: 'Search by name',
        }
      : null,
    filters: tenant
      ? {
          content: (
            <>
              {abilities.readTaxIds ? (
                <TextField
                  label="Tax ID"
                  value={taxId}
                  onChange={event => setTaxId(event.target.value)}
                  size="small"
                  autoComplete="off"
                />
              ) : null}
              <FormControlLabel
                control={
                  <Switch
                    checked={includeArchived}
                    onChange={event => setIncludeArchived(event.target.checked)}
                  />
                }
                label="Include archived"
              />
            </>
          ),
          chips,
        }
      : null,
    actions: tenant
      ? [
          ...bulk.actions,
          abilities.write && {
            label: settings.create,
            create: true,
            onClick: () => setCreating(true),
          },
        ]
      : null,
  });

  if (!tenant)
    return (
      <Alert severity="info">
        Select a tenant to see its {settings.title}.
      </Alert>
    );

  return (
    <Stack spacing={3}>
      {notice ? (
        <Alert severity="warning" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      ) : null}
      <DirectoryGrid
        collection={collection}
        filters={{
          kind,
          q: query || undefined,
          taxId: (abilities.readTaxIds && taxIdQuery) || undefined,
          includeArchived,
        }}
        ariaLabel={settings.title}
        emptyMessage={settings.empty}
        abilities={abilities}
        onOpen={row => setSelected(row.id)}
        refreshKey={reloadKey}
        onSelectionChange={bulk.onSelectionChange}
      />
      {bulk.dialogs}
      {selected ? (
        <RecordDetailDialog
          collection={collection}
          id={selected}
          abilities={abilities}
          onClose={() => {
            setSelected(null);
            if (params.has('open')) setParams({}, { replace: true });
          }}
          onChanged={reload}
        />
      ) : null}
      {creating ? (
        <RecordFormDialog
          collection={collection}
          record={null}
          defaults={{ kind }}
          canWriteTaxIds={abilities.writeTaxIds}
          canManagePortal={abilities.write && abilities.assignRoles}
          onClose={() => setCreating(false)}
          onSaved={saved => {
            setCreating(false);
            setNotice(
              saved.duplicateTaxIds?.length
                ? `Saved. ${saved.duplicateTaxIds.length} other record(s) have the same tax ID.`
                : null
            );
            setSelected(saved.id);
            reload();
          }}
        />
      ) : null}
    </Stack>
  );
}
