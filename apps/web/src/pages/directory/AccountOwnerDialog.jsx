/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { updateDirectoryRecord } from '../../api/endpoints.js';
import { EmployeeSelect } from '../../components/EmployeeSelect.jsx';
import { SectionDialog } from '../../components/SectionDialog.jsx';
import { describeDirectoryError } from './directoryErrors.js';

/**
 * The account owner pencil's dialog (I0014-R022, R023): one active
 * employee, or none. An archived owner stays until changed.
 * @param {{record: object, label: string, onClose: () => void, onSaved: () => void, onStale: () => Promise<object>}} props
 * @returns {JSX.Element}
 */
export function AccountOwnerDialog({
  record,
  label,
  onClose,
  onSaved,
  onStale,
}) {
  const toOption = owner => {
    if (!owner) return null;
    const [firstName, ...rest] = owner.name.split(' ');
    return { id: owner.id, firstName, lastName: rest.join(' ') };
  };
  const [owner, setOwner] = useState(() => toOption(record.accountOwner));

  async function save() {
    if ((owner?.id ?? null) === (record.accountOwner?.id ?? null)) {
      onClose();
      return;
    }
    await updateDirectoryRecord('organizations', record.id, {
      accountOwnerId: owner?.id ?? null,
      revision: record.revision,
    });
    onSaved();
  }

  return (
    <SectionDialog
      title={label}
      onClose={onClose}
      onSave={save}
      onStale={async () => {
        const fresh = await onStale();
        setOwner(toOption(fresh.accountOwner));
      }}
      describe={err =>
        describeDirectoryError(err, {
          INVALID_STATE: 'Choose an active employee.',
        })
      }
    >
      <EmployeeSelect label={label} value={owner} onChange={setOwner} />
    </SectionDialog>
  );
}
