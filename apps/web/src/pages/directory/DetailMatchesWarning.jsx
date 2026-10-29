/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';
import { Link as RouterLink } from 'react-router';
import { KIND_LABELS, matchTarget } from './directoryRecords.js';

/**
 * The other records already holding this email, phone, or address, each
 * with a link that opens it (M0005-R065, R067). The save is not refused.
 * @param {{matches: object[], onFollow: () => void}} props
 *   `onFollow` runs when a link is followed, such as closing the dialog.
 * @returns {JSX.Element}
 */
export function DetailMatchesWarning({ matches, onFollow }) {
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      Also on:
      {matches.map(match => (
        <div key={match.id}>
          {match.name} ({KIND_LABELS[match.kind]}
          {match.organization ? ` at ${match.organization.name}` : ''})
          {match.archived ? ' · Archived' : ''} ·{' '}
          <Link
            component={RouterLink}
            to={matchTarget(match)}
            onClick={onFollow}
            aria-label={`Open ${match.name}`}
          >
            Open
          </Link>
        </div>
      ))}
    </Alert>
  );
}
