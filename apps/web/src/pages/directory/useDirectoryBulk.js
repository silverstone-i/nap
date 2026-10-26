/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ApiError } from '../../api/client.js';
import { bulkDirectoryAction } from '../../api/endpoints.js';
import { useBulkArchive } from '../../grid/useBulkArchive.jsx';
import { ARCHIVE_TEXT } from './DirectoryGrid.jsx';
import { describeDirectoryError, PORTAL_MESSAGES } from './directoryErrors.js';
import { recordName } from './directoryRecords.js';

/**
 * Archive selected and Restore selected for a directory grid (M0005-R029,
 * R030), all or nothing.
 * @param {{
 *   collection: 'people'|'organizations'|'organization-contacts',
 *   abilities: {write: boolean, onError?: (err: unknown) => void},
 *   onDone: () => void,
 *   archived: boolean,
 *   noun: [string, string],
 * }} options `archived` is the grid's view (I0011-R005). `noun` names the
 *   rows, such as `['vendor', 'vendors']`, for the confirmation and notice
 *   (M0005-R054, R055).
 * @returns {ReturnType<typeof useBulkArchive>}
 */
export function useDirectoryBulk({
  collection,
  abilities,
  onDone,
  archived,
  noun,
}) {
  return useBulkArchive({
    canWrite: abilities.write,
    archived,
    noun,
    nameOf: recordName,
    run: (action, items) => bulkDirectoryAction(collection, action, items),
    describeError: err => describeDirectoryError(err),
    describeItem: (code, action) =>
      describeDirectoryError(
        new ApiError(code, 409),
        action === 'archive' ? PORTAL_MESSAGES.archive : {}
      ),
    archiveText: ARCHIVE_TEXT,
    onDone,
    onError: abilities.onError,
  });
}
