/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  assignMembershipRole,
  getMembershipRoles,
  listTenantMemberships,
  removeMembershipRole,
} from '../../api/endpoints.js';
import { ConfirmDialog } from '../../grid/ConfirmDialog.jsx';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { describeRoleError } from './roleErrors.js';

/**
 * How a membership reads in the picker: the person and their party label,
 * such as "Jack Black · Vendor · Black Plumbing" (I0012-R017).
 * @param {{name: string|null, label: string|null}} member
 * @returns {string}
 */
function memberText(member) {
  const parts = [member.name, member.label].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Initial Napsoft login';
}

/**
 * A membership's role assignments in the selected tenant (M0003-R016,
 * I0012-R013): pick a member, see their active roles, assign or remove one.
 * A person who is two parties appears once per party.
 * @param {{roles: import('../../api/endpoints.js').RoleView[]}} props Active roles offered for assignment.
 * @returns {JSX.Element}
 */
export function UserRolesSection({ roles }) {
  const [members, setMembers] = useState([]);
  const [membershipId, setMembershipId] = useState('');
  const [assigned, setAssigned] = useState(null);
  const [roleToAssign, setRoleToAssign] = useState('');
  const [pendingRemove, setPendingRemove] = useState(null);
  const [error, setError] = useState(null);
  const { can, onError } = useCapabilities();
  const canAssign = can('access-control::assignments::write');

  useEffect(() => {
    let cancelled = false;
    listTenantMemberships()
      .then(rows => {
        if (!cancelled) setMembers(rows);
      })
      .catch(err => {
        if (!cancelled) setError(describeRoleError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!membershipId) return undefined;
    let cancelled = false;
    getMembershipRoles(membershipId)
      .then(result => {
        if (!cancelled) setAssigned(result.roles);
      })
      .catch(err => {
        if (!cancelled) setError(describeRoleError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [membershipId]);

  async function handleAssign() {
    setError(null);
    try {
      const result = await assignMembershipRole(membershipId, roleToAssign);
      setAssigned(result.roles);
      setRoleToAssign('');
    } catch (err) {
      onError(err);
      setError(describeRoleError(err));
    }
  }

  async function handleRemove(role) {
    setPendingRemove(null);
    if (!role) return;
    setError(null);
    try {
      const result = await removeMembershipRole(membershipId, role.id);
      setAssigned(result.roles);
    } catch (err) {
      onError(err);
      setError(describeRoleError(err));
    }
  }

  const assignedIds = new Set((assigned ?? []).map(role => role.id));
  const assignable = roles.filter(
    role => !role.archived && !assignedIds.has(role.id)
  );

  return (
    <Stack spacing={2} component="section" aria-label="User roles">
      <Typography variant="h6" component="h2">
        User roles
      </Typography>
      {error ? (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}
      <TextField
        select
        label="User"
        value={membershipId}
        onChange={event => {
          setAssigned(null);
          setMembershipId(event.target.value);
        }}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        size="small"
        sx={{ maxWidth: 360 }}
      >
        <option value="">Choose a user</option>
        {members.map(member => (
          <option key={member.id} value={member.id}>
            {memberText(member)}
          </option>
        ))}
      </TextField>
      {membershipId && assigned ? (
        <>
          {assigned.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              This user holds no roles in this tenant.
            </Typography>
          ) : (
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: 'wrap' }}
            >
              {assigned.map(role => (
                <Chip
                  key={role.id}
                  label={role.name}
                  onDelete={
                    canAssign ? () => setPendingRemove(role) : undefined
                  }
                />
              ))}
            </Stack>
          )}
          {canAssign ? (
            <Stack direction="row" spacing={1}>
              <TextField
                select
                label="Role to assign"
                value={roleToAssign}
                onChange={event => setRoleToAssign(event.target.value)}
                slotProps={{
                  select: { native: true },
                  inputLabel: { shrink: true },
                }}
                size="small"
                sx={{ minWidth: 240 }}
              >
                <option value="">Choose a role</option>
                {assignable.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </TextField>
              <Button
                variant="outlined"
                size="small"
                disabled={!roleToAssign}
                onClick={handleAssign}
              >
                Assign role
              </Button>
            </Stack>
          ) : null}
        </>
      ) : null}
      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title="Remove role?"
        description={
          pendingRemove ? `Remove ${pendingRemove.name} from this user?` : ''
        }
        confirmLabel="Remove"
        onConfirm={() => handleRemove(pendingRemove)}
        onCancel={() => setPendingRemove(null)}
      />
    </Stack>
  );
}
