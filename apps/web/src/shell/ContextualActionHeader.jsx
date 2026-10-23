/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ActionBar } from './ActionBar.jsx';
import { usePageHeaderValue } from './PageHeaderContext.jsx';

/**
 * The filter button and the popover holding the page's filter controls
 * (I0001-R029). The badge counts the active filters. The popover opens with
 * a Filters heading, so it never reads as an action menu (those are ⋮), and
 * while any filter is active offers Clear all, which removes every chip.
 * @param {{filters: import('./PageHeaderContext.jsx').HeaderFilters}} props
 * @returns {JSX.Element}
 */
function FilterButton({ filters }) {
  const [anchor, setAnchor] = useState(null);
  const active = filters.chips?.length ?? 0;
  return (
    <>
      <IconButton
        aria-label="Filters"
        onClick={event => setAnchor(event.currentTarget)}
      >
        <Badge badgeContent={active} color="primary">
          <FilterListIcon />
        </Badge>
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: { role: 'dialog', 'aria-labelledby': 'filters-heading' },
        }}
      >
        <Stack spacing={2} sx={{ p: 2, minWidth: 260 }}>
          <Stack
            direction="row"
            sx={{ alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Typography id="filters-heading" variant="subtitle2" component="h2">
              Filters
            </Typography>
            {active > 0 ? (
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  for (const chip of filters.chips) chip.onDelete();
                }}
              >
                Clear all
              </Button>
            ) : null}
          </Stack>
          {filters.content}
        </Stack>
      </Popover>
    </>
  );
}

/**
 * The row above the work area where the active destination supplies its
 * title, search, filters, and actions (I0001 §5, R009, R028, R029). The
 * search and filter button wrap onto their own full-width line on a phone.
 * @param {{headingRef: import('react').Ref<HTMLHeadingElement>}} props
 * @returns {JSX.Element}
 */
export function ContextualActionHeader({ headingRef }) {
  const { title, actions, search, filters } = usePageHeaderValue();
  const chips = filters?.chips ?? [];
  return (
    <Box
      sx={{
        px: 3,
        py: 2,
        borderBottom: 1,
        borderColor: 'divider',
        minHeight: 64,
        // A flex child of the scrolling work area: without this a tall
        // grid squeezes the header and its search row overlaps the grid.
        flexShrink: 0,
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          flexWrap: 'wrap',
          columnGap: 2,
          rowGap: 1,
        }}
      >
        <Typography
          component="h1"
          variant="h1"
          ref={headingRef}
          tabIndex={-1}
          sx={{ outline: 'none', mr: 'auto' }}
        >
          {title}
        </Typography>
        {search || filters ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              order: { xs: 3, sm: 0 },
              width: { xs: '100%', sm: 'auto' },
            }}
          >
            {search ? (
              <TextField
                type="search"
                size="small"
                value={search.value}
                placeholder={search.placeholder ?? 'Search'}
                onChange={event => search.onChange(event.target.value)}
                sx={{ flex: { xs: 1, sm: 'none' }, width: { sm: 240 } }}
                slotProps={{
                  htmlInput: { 'aria-label': search.label ?? 'Search' },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            ) : null}
            {filters ? <FilterButton filters={filters} /> : null}
          </Stack>
        ) : null}
        {actions ? <ActionBar actions={actions} /> : null}
      </Stack>
      {chips.length > 0 ? (
        <Stack
          direction="row"
          aria-label="Active filters"
          sx={{ flexWrap: 'wrap', gap: 1, mt: 1 }}
        >
          {chips.map(chip => (
            <Chip
              key={chip.key}
              size="small"
              label={chip.label}
              onDelete={chip.onDelete}
            />
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}
