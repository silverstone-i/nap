/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import { formatTaxId, maskTaxId } from '@nap/shared';
import { listTaxIdFormats } from '../../api/endpoints.js';

/**
 * The tenant's tax ID formats, archived ones included, loaded once per
 * mount. Null while loading; empty when the load fails, so tax IDs still
 * show their last four characters.
 * @param {string|null|undefined} tenantId Reloads when the tenant changes.
 * @returns {object[]|null}
 */
export function useTaxIdFormats(tenantId) {
  const [formats, setFormats] = useState(null);
  useEffect(() => {
    let live = true;
    listTaxIdFormats()
      .then(rows => live && setFormats(rows))
      .catch(() => live && setFormats([]));
    return () => {
      live = false;
    };
  }, [tenantId]);
  return formats;
}

/**
 * How a record's tax ID shows in its format's layout (M0005-R040): masked
 * from its last four, or the revealed value laid out.
 * @param {{taxIdLast4: string|null, taxIdFormatId: string|null}} record
 * @param {object[]|null} formats
 * @param {string|null} [revealed] The canonical value from the reveal route.
 * @returns {string|null} Null when the record has no tax ID.
 */
export function displayTaxId(record, formats, revealed = null) {
  if (!record.taxIdLast4) return null;
  const mask = formats?.find(f => f.id === record.taxIdFormatId)?.mask;
  if (revealed) return mask ? formatTaxId(revealed, mask) : revealed;
  return mask ? maskTaxId(record.taxIdLast4, mask) : `•••${record.taxIdLast4}`;
}

/**
 * The format a new tax ID starts in (M0005-R043): US EIN for a vendor or
 * client, US SSN for a person, when that format is active.
 * @param {object[]|null} formats
 * @param {boolean} organization
 * @returns {string} A format ID, or '' when none applies.
 */
export function defaultTaxIdFormatId(formats, organization) {
  const name = organization ? 'EIN' : 'SSN';
  return (
    formats?.find(f => !f.archived && f.country === 'US' && f.name === name)
      ?.id ?? ''
  );
}
