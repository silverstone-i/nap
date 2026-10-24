/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';

/**
 * The Active and Archived tabs that switch a list's view (I0011-R001,
 * R002). Each view lists one set of records; the screen hides the actions
 * that do not apply to it.
 * @param {{archived: boolean, onChange: (archived: boolean) => void}} props
 * @returns {JSX.Element}
 */
export function ArchiveViewTabs({ archived, onChange }) {
  return (
    <Tabs
      value={archived ? 'archived' : 'active'}
      onChange={(_event, value) => onChange(value === 'archived')}
      aria-label="View"
    >
      <Tab value="active" label="Active" />
      <Tab value="archived" label="Archived" />
    </Tabs>
  );
}
