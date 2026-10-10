/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StandardDataGrid } from '../src/grid/StandardDataGrid.jsx';
import { ThemeModeProvider } from '../src/theme/ThemeModeContext.jsx';
import { installMatchMedia, installResizeObserver } from './testUtils.jsx';

const ROWS = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
];

const COLUMNS = [{ field: 'name', headerName: 'Name', flex: 1 }];

function fetchPage() {
  return Promise.resolve({ rows: ROWS, rowCount: ROWS.length });
}

function renderGrid(props = {}) {
  return render(
    <ThemeModeProvider>
      <StandardDataGrid columns={COLUMNS} fetchPage={fetchPage} {...props} />
    </ThemeModeProvider>
  );
}

beforeEach(() => {
  installMatchMedia();
  installResizeObserver();
});

afterEach(() => {
  cleanup();
});

describe('StandardDataGrid', () => {
  it('renders the rows a server page provides', async () => {
    renderGrid();
    expect(await screen.findByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('clears row selection when the tenant context (resetKey) changes', async () => {
    const user = userEvent.setup();
    const { rerender } = renderGrid({ resetKey: 'tenant-1' });
    await screen.findByText('Alpha');

    const checkboxes = screen.getAllByRole('checkbox', { name: /select row/i });
    await user.click(checkboxes[0]);
    expect(checkboxes[0].checked).toBe(true);

    rerender(
      <ThemeModeProvider>
        <StandardDataGrid
          columns={COLUMNS}
          fetchPage={fetchPage}
          resetKey="tenant-2"
        />
      </ThemeModeProvider>
    );
    await screen.findByText('Alpha');
    const afterSwitch = screen.getAllByRole('checkbox', {
      name: /select row/i,
    });
    expect(afterSwitch[0].checked).toBe(false);
  });

  it.each([
    [undefined, 'This action cannot be undone.'],
    ['Reversible later.', 'Reversible later.'],
  ])(
    'confirms a destructive action with its own description (%s)',
    async (confirmDescription, expected) => {
      const user = userEvent.setup();
      renderGrid({
        rowActions: () => [
          {
            label: 'Remove',
            destructive: true,
            confirmDescription,
            onClick: () => {},
          },
        ],
      });
      await screen.findByText('Alpha');
      await user.click(screen.getAllByRole('menuitem', { name: 'more' })[0]);
      await user.click(await screen.findByRole('menuitem', { name: 'Remove' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(expected)).toBeTruthy();
    }
  );

  it('reports the selected row IDs, and the clear on reset (I0001-R016)', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const { rerender } = renderGrid({ resetKey: 'a', onSelectionChange });
    await screen.findByText('Alpha');
    await user.click(
      screen.getAllByRole('checkbox', { name: /select row/i })[1]
    );
    expect(onSelectionChange).toHaveBeenLastCalledWith([2], [ROWS[1]]);
    rerender(
      <ThemeModeProvider>
        <StandardDataGrid
          columns={COLUMNS}
          fetchPage={fetchPage}
          resetKey="b"
          onSelectionChange={onSelectionChange}
        />
      </ThemeModeProvider>
    );
    await screen.findByText('Alpha');
    expect(onSelectionChange).toHaveBeenLastCalledWith([], []);
  });

  it('names the grid and describes a load failure (M0005-R028)', async () => {
    renderGrid({
      ariaLabel: 'Employees',
      fetchPage: () => Promise.reject(new Error('CELL_UNAVAILABLE')),
      describeError: err => `Directory said ${err.message}`,
    });
    expect(
      await screen.findByText('Directory said CELL_UNAVAILABLE')
    ).toBeTruthy();
    expect(screen.getByRole('grid', { name: 'Employees' })).toBeTruthy();
  });
});
