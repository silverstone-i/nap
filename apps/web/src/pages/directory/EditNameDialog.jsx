/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import TextField from '@mui/material/TextField';
import { updateDirectoryRecord } from '../../api/endpoints.js';
import { describeDirectoryError } from './directoryErrors.js';
import { SectionDialog } from '../../components/SectionDialog.jsx';

/**
 * The name pencil's dialog (M0005-R049): a person's first and last name, or
 * an organization's legal name and DBA name (R053).
 * @param {{collection: 'people'|'organizations'|'organization-contacts', record: object, onClose: () => void, onSaved: () => void, onStale: () => void}} props
 * @returns {JSX.Element}
 */
export function EditNameDialog({
  collection,
  record,
  onClose,
  onSaved,
  onStale,
}) {
  const organization = collection === 'organizations';
  const [firstName, setFirstName] = useState(record.firstName ?? '');
  const [lastName, setLastName] = useState(record.lastName ?? '');
  const [legalName, setLegalName] = useState(record.legalName ?? '');
  const [dbaName, setDbaName] = useState(record.dbaName ?? '');

  async function save() {
    await updateDirectoryRecord(collection, record.id, {
      ...(organization
        ? { legalName, dbaName: dbaName.trim() ? dbaName.trim() : null }
        : { firstName, lastName }),
      revision: record.revision,
    });
    onSaved();
  }

  return (
    <SectionDialog
      title="Edit name"
      onClose={onClose}
      onSave={save}
      describe={err => describeDirectoryError(err)}
      onStale={onStale}
    >
      {organization ? (
        <>
          <TextField
            label={
              record.kind === 'client' ? 'Legal name or unit' : 'Legal name'
            }
            value={legalName}
            onChange={event => setLegalName(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="DBA name"
            value={dbaName}
            onChange={event => setDbaName(event.target.value)}
            fullWidth
          />
        </>
      ) : (
        <>
          <TextField
            label="First name"
            value={firstName}
            onChange={event => setFirstName(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Last name"
            value={lastName}
            onChange={event => setLastName(event.target.value)}
            required
            fullWidth
          />
        </>
      )}
    </SectionDialog>
  );
}
