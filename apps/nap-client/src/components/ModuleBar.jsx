import React from 'react';
import { Stack, Button } from '@mui/material';

// Renders a horizontal action bar for module-level operations.
// Accepts either an array of labels or an array of objects with a `label` field.
export default function ModuleBar({ actions = [], sx = {}, spacing = 1.5 }) {
  const normalizedActions = actions.map((action) =>
    typeof action === 'string' ? { label: action } : action
  );

  return (
    <Stack
      direction="row"
      spacing={spacing}
      sx={[
        {
          mb: 3,
          flexWrap: 'wrap',
          alignItems: 'center',
          width: '100%',
          minWidth: 0,
          maxWidth: '100%'
        },
        sx
      ]}
    >
      {normalizedActions.map((action, index) => (
        <Button
          key={action.label}
          variant={action.variant || (index === 0 ? 'contained' : 'outlined')}
          color={action.color || 'primary'}
          startIcon={action.icon}
          onClick={action.onClick}
          disabled={action.disabled}
          size={action.size || 'medium'}
        >
          {action.label}
        </Button>
      ))}
    </Stack>
  );
}
