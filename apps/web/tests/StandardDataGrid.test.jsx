/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
