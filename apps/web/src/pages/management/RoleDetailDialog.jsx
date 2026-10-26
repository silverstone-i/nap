/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import EditIcon from '@mui/icons-material/Edit';
import { updateRole } from '../../api/endpoints.js';
import { SectionDialog } from '../../components/SectionDialog.jsx';
import { GrantsField } from './GrantsField.jsx';
import { RoleBadges } from './RoleBadges.jsx';
import { describeRoleError } from './roleErrors.js';
import { groupGrantsByModule } from './roleGrants.js';

/**
 * A pencil that opens one part of the role for editing (M0003-R019).
 * @param {{label: string, onClick: () => void}} props
 * @returns {JSX.Element}
 */
function Pencil({ label, onClick }) {
  return (
    <IconButton size="small" aria-label={label} onClick={onClick}>
      <EditIcon fontSize="small" />
    </IconButton>
  );
}

/**
 * The name and description pencil's dialog (M0003-R019).
 * @param {{role: object, onClose: () => void, onSaved: (role: object) => void, onStale: () => Promise<object>}} props
 * @returns {JSX.Element}
 */
function RoleNameDialog({ role, onClose, onSaved, onStale }) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  return (
    <SectionDialog
      title="Edit name"
      onClose={onClose}
      onSave={async () =>
        onSaved(
          await updateRole(role.id, {
            name,
            description: description.trim() || null,
            revision: role.revision,
          })
        )
      }
      describe={describeRoleError}
      onStale={async () => {
        const fresh = await onStale();
        setName(fresh.name);
        setDescription(fresh.description ?? '');
      }}
    >
      <TextField
        label="Name"
        value={name}
        onChange={event => setName(event.target.value)}
        required
        fullWidth
      />
      <TextField
        label="Description"
        value={description}
        onChange={event => setDescription(event.target.value)}
        multiline
        fullWidth
      />
    </SectionDialog>
  );
}

/**
 * The grants pencil's dialog (M0003-R019): `grants` replaces the full set.
 * @param {{role: object, tenantCode: string, onClose: () => void, onSaved: (role: object) => void, onStale: () => Promise<object>, onError: (err: unknown) => void}} props
 * @returns {JSX.Element}
 */
function RoleGrantsDialog({
  role,
  tenantCode,
  onClose,
  onSaved,
  onStale,
  onError,
}) {
  const [grants, setGrants] = useState(role.grants);
  return (
    <SectionDialog
      title="Edit grants"
      onClose={onClose}
      onSave={async () =>
        onSaved(await updateRole(role.id, { grants, revision: role.revision }))
      }
      describe={describeRoleError}
      onStale={async () => setGrants((await onStale()).grants)}
    >
      <GrantsField
        grants={grants}
        onChange={setGrants}
        tenantCode={tenantCode}
        onError={onError}
      />
    </SectionDialog>
  );
}

/**
 * Role detail (M0003-R016, R019): badges, description, and grants grouped
 * by module. It is the role's only edit surface: pencils change the name
 * and description, and the grants. An immutable or archived role, or a
 * session without `access-control::roles::write` (I0005-R011), shows no
 * pencils; archive and restore follow the role's state.
 * @param {{role: import('../../api/endpoints.js').RoleView, canWrite: boolean, tenantCode: string, onClose: () => void, onSaved: (role: object) => void, onStale: () => Promise<object>, onError: (err: unknown) => void, onArchive: () => void, onRestore: () => void}} props
 * @returns {JSX.Element}
 */
export function RoleDetailDialog({
  role,
  canWrite,
  tenantCode,
  onClose,
  onSaved,
  onStale,
  onError,
  onArchive,
  onRestore,
}) {
  const [section, setSection] = useState(null);
  const groups = groupGrantsByModule(role.grants);
  const canEdit = canWrite && !role.isImmutable && !role.archived;
  const saved = role => {
    setSection(null);
    onSaved(role);
  };
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        aria-labelledby="role-detail-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="role-detail-title">
          {role.name}{' '}
          <Typography component="span" color="text.secondary">
            ({role.code})
          </Typography>{' '}
          <RoleBadges role={role} />
          {canEdit ? (
            <Pencil label="Edit name" onClick={() => setSection('name')} />
          ) : null}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {role.description ? (
              <Typography variant="body2">{role.description}</Typography>
            ) : null}
            <Stack direction="row" sx={{ alignItems: 'center' }}>
              <Typography variant="subtitle1">Grants</Typography>
              {canEdit ? (
                <Pencil
                  label="Edit grants"
                  onClick={() => setSection('grants')}
                />
              ) : null}
            </Stack>
            {groups.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                This role grants nothing.
              </Typography>
            ) : (
              groups.map(group => (
                <section key={group.module} aria-label={group.label}>
                  <Typography variant="subtitle2">{group.label}</Typography>
                  <List dense disablePadding>
                    {group.grants.map(grant => (
                      <ListItem key={grant} disableGutters>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'monospace' }}
                        >
                          {grant}
                        </Typography>
                      </ListItem>
                    ))}
                  </List>
                </section>
              ))
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {!canWrite || role.isImmutable ? null : role.archived ? (
            <Button variant="text" onClick={onRestore}>
              Restore
            </Button>
          ) : (
            <Button variant="text" onClick={onArchive}>
              Archive
            </Button>
          )}
          <Button variant="contained" onClick={onClose}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      {section === 'name' ? (
        <RoleNameDialog
          role={role}
          onClose={() => setSection(null)}
          onSaved={saved}
          onStale={onStale}
        />
      ) : null}
      {section === 'grants' ? (
        <RoleGrantsDialog
          role={role}
          tenantCode={tenantCode}
          onClose={() => setSection(null)}
          onSaved={saved}
          onStale={onStale}
          onError={onError}
        />
      ) : null}
    </>
  );
}
