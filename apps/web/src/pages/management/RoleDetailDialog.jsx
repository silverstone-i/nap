/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { RoleBadges } from './RoleBadges.jsx';
import { groupGrantsByModule } from './roleGrants.js';

/**
 * Role detail (M0003-R016): badges, description, and grants grouped by
 * module. Edit and archive are absent for an immutable role; archive and
 * restore are mutually exclusive by the role's state.
 * @param {{role: import('../../api/endpoints.js').RoleView, onClose: () => void, onEdit: () => void, onArchive: () => void, onRestore: () => void}} props
 * @returns {JSX.Element}
 */
export function RoleDetailDialog({
  role,
  onClose,
  onEdit,
  onArchive,
  onRestore,
}) {
  const groups = groupGrantsByModule(role.grants);
  return (
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
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <RoleBadges role={role} />
          {role.description ? (
            <Typography variant="body2">{role.description}</Typography>
          ) : null}
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
        {role.isImmutable ? null : role.archived ? (
          <Button variant="text" onClick={onRestore}>
            Restore
          </Button>
        ) : (
          <>
            <Button variant="text" onClick={onArchive}>
              Archive
            </Button>
            <Button variant="text" onClick={onEdit}>
              Edit
            </Button>
          </>
        )}
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
