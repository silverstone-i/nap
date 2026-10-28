/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { ApiError } from '../../api/client.js';
import { updateDirectoryRecord } from '../../api/endpoints.js';
import { describeDirectoryError } from './directoryErrors.js';
import { DuplicateTaxIdMessage, TaxIdInput } from './directoryFields.jsx';
import { SectionDialog } from '../../components/SectionDialog.jsx';
import { defaultTaxIdFormatId } from './useTaxIdFormats.js';

/**
 * The tax ID pencil's dialog (M0005-R052): a format and a new value, and
 * **Clear** when the record may have none. The stored value stays masked
 * on the detail; this dialog never shows it. A duplicate shows R048's
 * message with its link.
 * @param {{collection: 'people'|'organizations'|'organization-contacts', record: object, formats: object[]|null, onClose: () => void, onSaved: () => void, onStale: () => Promise<object>}} props
 * @returns {JSX.Element}
 */
export function TaxIdDialog({
  collection,
  record,
  formats,
  onClose,
  onSaved,
  onStale,
}) {
  const organization = collection === 'organizations';
  const ownFormat = formats?.find(
    f => f.id === record.taxIdFormatId && !f.archived
  );
  const [chosenFormatId, setChosenFormatId] = useState(null);
  const formatId =
    chosenFormatId ??
    ownFormat?.id ??
    defaultTaxIdFormatId(formats, organization);
  const [value, setValue] = useState('');
  // R006, R009: a vendor and a client's primary tax contact must keep one.
  const canClear =
    Boolean(record.taxIdLast4) &&
    record.kind !== 'vendor' &&
    !record.isPrimaryTaxContact;

  async function send(taxId) {
    await updateDirectoryRecord(collection, record.id, {
      ...(taxId === null
        ? { taxId: null }
        : { taxId, taxIdFormatId: formatId }),
      revision: record.revision,
    });
    onSaved();
  }

  return (
    <SectionDialog
      title="Edit tax ID"
      onClose={onClose}
      onSave={() => send(value.trim())}
      // The stored tax ID is never shown, so a stale save keeps the typed
      // value and format; the retry takes the reloaded record's revision.
      onStale={onStale}
      describe={err =>
        err instanceof ApiError &&
        err.code === 'DUPLICATE_TAX_ID' &&
        err.details?.id ? (
          <DuplicateTaxIdMessage
            kind={record.kind}
            holder={err.details}
            onFollow={onClose}
          />
        ) : (
          describeDirectoryError(err)
        )
      }
      secondary={
        canClear ? { label: 'Clear', onRun: () => send(null) } : undefined
      }
    >
      <TaxIdInput
        label="Tax ID"
        value={value}
        onChange={setValue}
        formats={formats}
        formatId={formatId}
        onFormatChange={setChosenFormatId}
      />
    </SectionDialog>
  );
}
