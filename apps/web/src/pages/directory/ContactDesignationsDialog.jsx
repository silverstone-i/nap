/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import {
  getDirectoryRecord,
  listContactLabels,
  setEmailDesignations,
  setPersonDesignations,
} from '../../api/endpoints.js';
import { SectionDialog } from '../../components/SectionDialog.jsx';
import { addressName, DESIGNATION_LABELS } from './contactDesignationText.js';
import { describeDirectoryError } from './directoryErrors.js';

/**
 * The bill-to addresses of an organization.
 * @param {object[]} addresses
 * @returns {object[]}
 */
function billTos(addresses) {
  return addresses.filter(
    address =>
      !address.archived &&
      address.purposes?.some(purpose => purpose.purpose === 'bill_to')
  );
}

/**
 * The tenant's active designation tags (I0014-R004), plus any the person holds.
 * @param {{value: string[], onChange: (ids: string[]) => void, current: {id: string, name: string}[]}} props
 * @returns {JSX.Element}
 */
function TagSelect({ value, onChange, current }) {
  const [tags, setTags] = useState(null);
  useEffect(() => {
    let live = true;
    listContactLabels({ appliesTo: 'designation' })
      .then(rows => live && setTags(rows.filter(tag => !tag.archived)))
      .catch(() => live && setTags([]));
    return () => {
      live = false;
    };
  }, []);
  const options = [
    ...(tags ?? []),
    ...current.filter(tag => !(tags ?? []).some(t => t.id === tag.id)),
  ];
  return (
    <Autocomplete
      multiple
      loading={tags === null}
      options={options}
      getOptionLabel={tag => tag.name}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      value={options.filter(tag => value.includes(tag.id))}
      onChange={(_event, selected) => onChange(selected.map(tag => tag.id))}
      renderInput={params => <TextField {...params} label="Tags" />}
    />
  );
}

/**
 * The Designations pencil's dialog (I0014-R028). A switch per designation the holder may
 * hold; under Billing, for an organization's holder, the bill-to
 * addresses it is limited to (none means all) and Copy on all invoices,
 * which only an unlimited holder may have (R013, R014). A person also takes
 * designation tags. Save replaces the whole set (R011, R012).
 *
 * `holder` is `{ kind: 'person', collection, record }` or
 * `{ kind: 'email', organization, method }`.
 * @param {{holder: object, onClose: () => void, onSaved: () => void, onStale: () => Promise<object>}} props
 * @returns {JSX.Element}
 */
export function ContactDesignationsDialog({
  holder,
  onClose,
  onSaved,
  onStale,
}) {
  const person = holder.kind === 'person';
  const record = person ? holder.record : holder.method;
  const organizationId = person
    ? (record.organizationId ?? null)
    : holder.organization.id;
  const allowed = !person
    ? ['billing']
    : organizationId
      ? ['primary', 'billing']
      : ['primary', 'billing', 'notifications'];
  const [designations, setDesignations] = useState(
    record.contactDesignations ?? []
  );
  const [tagIds, setTagIds] = useState(() =>
    (record.tags ?? []).map(tag => tag.id)
  );
  const [addresses, setAddresses] = useState(
    person ? null : holder.organization.addresses
  );
  // A person's organization addresses load for the scope choice.
  useEffect(() => {
    if (!person || !organizationId) return undefined;
    let live = true;
    getDirectoryRecord('organizations', organizationId)
      .then(organization => live && setAddresses(organization.addresses))
      .catch(() => live && setAddresses([]));
    return () => {
      live = false;
    };
  }, [person, organizationId]);

  const holds = designation =>
    designations.some(entry => entry.designation === designation);
  const billing = designations.filter(entry => entry.designation === 'billing');
  const scope = billing.map(entry => entry.addressId).filter(Boolean);
  const copyAll = billing.some(entry => entry.copyAll);
  const options = billTos(addresses ?? []);

  /** Turn a designation on or off. */
  function toggle(designation, on) {
    setDesignations(current =>
      on
        ? [...current, { designation, addressId: null, copyAll: false }]
        : current.filter(entry => entry.designation !== designation)
    );
  }

  /** Limit billing to `ids`, or to none for every address. */
  function limitBilling(ids) {
    setDesignations(current => [
      ...current.filter(entry => entry.designation !== 'billing'),
      ...(ids.length
        ? ids.map(addressId => ({
            designation: 'billing',
            addressId,
            copyAll: false,
          }))
        : [{ designation: 'billing', addressId: null, copyAll: false }]),
    ]);
  }

  /** Set Copy on all invoices on the unlimited billing designation. */
  function setCopy(on) {
    setDesignations(current =>
      current.map(entry =>
        entry.designation === 'billing' ? { ...entry, copyAll: on } : entry
      )
    );
  }

  async function save() {
    const body = {
      designations: designations.map(
        ({ designation, addressId, copyAll: copy }) => ({
          designation,
          ...(addressId ? { addressId } : {}),
          ...(copy ? { copyAll: true } : {}),
        })
      ),
      revision: record.revision,
    };
    if (person)
      await setPersonDesignations(holder.collection, record.id, {
        ...body,
        tagIds,
      });
    else await setEmailDesignations(organizationId, record.id, body);
    onSaved();
  }

  return (
    <SectionDialog
      title={person ? 'Designations' : 'Billing'}
      onClose={onClose}
      onSave={save}
      onStale={async () => {
        const fresh = await onStale();
        const current = person
          ? fresh
          : fresh.contactMethods.find(method => method.id === record.id);
        if (!current) return;
        setDesignations(current.contactDesignations ?? []);
        setTagIds((current.tags ?? []).map(tag => tag.id));
      }}
      describe={err =>
        describeDirectoryError(err, {
          CONTACT_DETAILS_REQUIRED: person
            ? 'This person is missing the email, phone, or portal access a designation needs.'
            : 'A bill-to address this email serves is not delivered by email.',
          INVALID_STATE: 'A designation or address is no longer available.',
        })
      }
    >
      {allowed.map(designation => (
        <FormControlLabel
          key={designation}
          control={
            <Switch
              checked={holds(designation)}
              onChange={event => toggle(designation, event.target.checked)}
            />
          }
          label={person ? DESIGNATION_LABELS[designation] : 'Receives invoices'}
        />
      ))}
      {holds('billing') && organizationId ? (
        <Stack spacing={1} sx={{ pl: { sm: 4 } }}>
          <Autocomplete
            multiple
            loading={addresses === null}
            options={options.map(address => address.id)}
            getOptionLabel={id =>
              addressName(options.find(address => address.id === id))
            }
            value={scope}
            onChange={(_event, ids) => limitBilling(ids)}
            renderInput={params => (
              <TextField
                {...params}
                label="Bill-to addresses"
                placeholder={scope.length ? '' : 'All addresses'}
              />
            )}
          />
          {scope.length === 0 ? (
            <FormControlLabel
              control={
                <Switch
                  checked={copyAll}
                  onChange={event => setCopy(event.target.checked)}
                />
              }
              label="Copy on all invoices"
            />
          ) : null}
        </Stack>
      ) : null}
      {person ? (
        <TagSelect
          value={tagIds}
          onChange={setTagIds}
          current={record.tags ?? []}
        />
      ) : null}
    </SectionDialog>
  );
}
