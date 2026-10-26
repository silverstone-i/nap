/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { updateDirectoryRecord } from '../../api/endpoints.js';
import { PasswordField } from '../../components/PasswordField.jsx';
import { describeDirectoryError, PORTAL_MESSAGES } from './directoryErrors.js';
import { RolesSelect } from './directoryFields.jsx';
import { FormCheck } from '../../components/formCheck.js';
import { SectionDialog } from '../../components/SectionDialog.jsx';

/**
 * The portal access pencil's dialog (I0010-R013, R014): the switch, a
 * temporary password while access is being turned on, and the roles. One
 * request saves all three (I0008-R001, I0010-R009).
 * @param {{collection: 'people'|'organization-contacts', record: object, onClose: () => void, onSaved: () => void, onStale: () => void}} props
 * @returns {JSX.Element}
 */
export function PortalAccessDialog({
  collection,
  record,
  onClose,
  onSaved,
  onStale,
}) {
  const wasOn = record.isPortalUser === true;
  const currentRoles = record.roles ?? [];
  const [isPortalUser, setIsPortalUser] = useState(wasOn);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [roleIds, setRoleIds] = useState(() =>
    currentRoles.map(role => role.id)
  );
  const turningOn = isPortalUser && !wasOn;
  const turningOff = !isPortalUser && wasOn;
  const rolesChanged =
    roleIds.length !== currentRoles.length ||
    roleIds.some(id => !currentRoles.some(role => role.id === id));

  async function save() {
    // I0010-R005: access on needs at least one role.
    if (isPortalUser && roleIds.length === 0)
      throw new FormCheck('Choose at least one role for portal access.');
    if (!turningOn && !turningOff && !rolesChanged) {
      onClose();
      return;
    }
    await updateDirectoryRecord(collection, record.id, {
      isPortalUser,
      ...(turningOn ? { temporaryPassword } : {}),
      ...(isPortalUser && (turningOn || rolesChanged) ? { roleIds } : {}),
      revision: record.revision,
    });
    onSaved();
  }

  return (
    <SectionDialog
      title="Portal access"
      onClose={onClose}
      onSave={save}
      onStale={onStale}
      describe={err =>
        describeDirectoryError(
          err,
          turningOn
            ? PORTAL_MESSAGES.turnOn
            : turningOff
              ? PORTAL_MESSAGES.turnOff
              : {}
        )
      }
    >
      <FormControlLabel
        control={
          <Switch
            checked={isPortalUser}
            onChange={event => setIsPortalUser(event.target.checked)}
          />
        }
        label="Portal access"
      />
      {isPortalUser ? (
        <RolesSelect
          value={roleIds}
          onChange={setRoleIds}
          current={currentRoles}
        />
      ) : null}
      {turningOn ? (
        <PasswordField
          label="Temporary password"
          value={temporaryPassword}
          onChange={event => setTemporaryPassword(event.target.value)}
          required
        />
      ) : null}
    </SectionDialog>
  );
}
