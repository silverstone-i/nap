/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Link from '@mui/material/Link';
import { Link as RouterLink } from 'react-router';

/**
 * A create or rename refusal naming the archived record that holds the
 * value, with a link to the Archived view searched for it (I0011-R008).
 * @param {{message: string, to: string, onFollow?: () => void}} props
 *   `onFollow` runs when the link is followed, such as closing the dialog.
 * @returns {JSX.Element}
 */
export function ArchivedConflictMessage({ message, to, onFollow }) {
  return (
    <>
      {message}{' '}
      <Link component={RouterLink} to={to} onClick={onFollow}>
        Show it in Archived
      </Link>
    </>
  );
}
