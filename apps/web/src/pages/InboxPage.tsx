/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useNavigate } from 'react-router';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { getInboxItems } from '../mocks/data';
import type { InboxItem } from '../mocks/types';
import { useScope } from '../shell/useScope';
import { formatDate } from '../lib/format';

export function InboxPage() {
  const { entityId, projectId } = useScope();
  const navigate = useNavigate();
  const items = getInboxItems(entityId, projectId);

  // Inbox items deep-link to the record they reference: invoices open the
  // list with the preview drawer (?invoice=), projects open the detail page.
  function open(item: InboxItem) {
    if (item.ref.kind === 'invoice') {
      void navigate(`/${entityId}/ap/invoices?invoice=${item.ref.id}`);
    } else {
      void navigate(`/${entityId}/projects/${item.ref.id}`);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h6" component="h1">
        Inbox
      </Typography>
      {items.length === 0 ? (
        <Typography color="text.secondary">Nothing waiting on you.</Typography>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {items.map(item => (
              <ListItemButton key={item.id} divider onClick={() => open(item)}>
                <ListItemText
                  primary={item.title}
                  secondary={item.detail}
                  slotProps={{ primary: { sx: { fontWeight: 500 } } }}
                />
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <Chip
                    size="small"
                    label={item.type === 'approval' ? 'Approval' : 'Task'}
                    color={item.type === 'approval' ? 'info' : 'default'}
                    variant="outlined"
                  />
                  {item.due && (
                    <Typography variant="body2" color="text.secondary">
                      Due {formatDate(item.due)}
                    </Typography>
                  )}
                </Stack>
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </Stack>
  );
}
