/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import { listCellsOverview } from '../../api/endpoints.js';
import { DetailDialog } from './DetailDialog.jsx';
import { yesNo } from './yesNo.js';

/**
 * A tenant's detail (I0006-R020): tier, cell, readiness, and its
 * provisioning job, with View client and Retry when each applies.
 * @param {{tenant: object, onViewClient?: () => void, onRetry?: () => void, onClose: () => void}} props
 *   `tenant` is a grid row: the tenant with its job flattened. Pass
 *   `onViewClient` or `onRetry` only when that action applies.
 * @returns {JSX.Element}
 */
export function TenantDetailDialog({ tenant, onViewClient, onRetry, onClose }) {
  const [cellName, setCellName] = useState(null);
  useEffect(() => {
    if (!tenant.cellId) return undefined;
    let live = true;
    // Follow the cursor: the tenant's cell may be past the first page.
    (async () => {
      let cursor;
      do {
        const page = await listCellsOverview({ cursor, limit: 100 });
        const found = page.rows.find(row => row.cell.id === tenant.cellId);
        if (found) {
          if (live) setCellName(found.cell.database_name);
          return;
        }
        cursor = page.nextCursor;
      } while (cursor && live);
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [tenant.cellId]);

  return (
    <DetailDialog
      id="tenant-detail-title"
      title={`${tenant.name} (${tenant.code})`}
      rows={[
        ['Status', tenant.status],
        ['Tier', tenant.tier],
        ['Cell', cellName ?? tenant.cellId],
        ['Provisioned', yesNo(tenant.provisioned)],
        ['Roles ready', yesNo(tenant.rbacReady)],
        ['Stage', tenant.stage],
        ['Provisioning', tenant.jobStatus],
        ['Attempts', tenant.attempts],
        ['Failure code', tenant.failureCode],
      ]}
      actions={[
        onViewClient && { label: 'View client', onClick: onViewClient },
        onRetry && { label: 'Retry', onClick: onRetry },
      ].filter(Boolean)}
      onClose={onClose}
    />
  );
}
