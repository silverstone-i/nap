/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints.js';
import { CellsPage } from '../../src/pages/management/CellsPage.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { PageHeaderProvider } from '../../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../../src/theme/ThemeModeContext.jsx';
import { installMatchMedia, installResizeObserver } from '../testUtils.jsx';

vi.mock('../../src/api/endpoints.js', () => ({
  listCellsOverview: vi.fn(),
  registerCell: vi.fn(),
  retryCellProvisioning: vi.fn(),
  disableCell: vi.fn(),
}));

function overviewRow(overrides = {}) {
  return {
    cell: {
      id: 'c1',
      environment: 'dev',
      database_name: 'nap_dev_cell_acme',
      enabled: true,
      created_at: new Date().toISOString(),
      created_by: null,
      updated_at: new Date().toISOString(),
      updated_by: null,
      deactivated_at: null,
    },
    operation: {
      id: 'op1',
      cell_id: 'c1',
      operation_id: 'op1',
      requested_action: 'cell',
      stage: 'registered',
      status: 'queued',
      attempts: 0,
      failure_code: null,
      started_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ThemeModeProvider>
      <PageHeaderProvider>
        <ContextualActionHeader />
        <CellsPage />
      </PageHeaderProvider>
    </ThemeModeProvider>
  );
}

beforeEach(() => {
  installMatchMedia();
  installResizeObserver();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CellsPage', () => {
  it('flattens the overview row into environment/database/enabled/stage/status columns', async () => {
    api.listCellsOverview.mockResolvedValue({ rows: [overviewRow()], nextCursor: null });
    renderPage();
    expect(await screen.findByText('dev')).toBeTruthy();
    expect(screen.getByText('nap_dev_cell_acme')).toBeTruthy();
    expect(screen.getByText('registered')).toBeTruthy();
    expect(screen.getByText('queued')).toBeTruthy();
  });

  it('shows an explicit empty state', async () => {
    api.listCellsOverview.mockResolvedValue({ rows: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText('No cells registered yet.')).toBeTruthy();
  });

  it('shows a retryable error state', async () => {
    api.listCellsOverview.mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText('Could not load data.')).toBeTruthy();
  });

  it('shows Retry only for a failed operation, non-destructively (AC04)', async () => {
    api.listCellsOverview.mockResolvedValue({
      rows: [overviewRow({ operation: { ...overviewRow().operation, status: 'failed' } })],
      nextCursor: null,
    });
    api.retryCellProvisioning.mockResolvedValue({});
    renderPage();
    await screen.findByText('dev');
    const user = userEvent.setup();
    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    const retry = await screen.findByRole('menuitem', { name: 'Retry' });
    await user.click(retry);
    expect(api.retryCellProvisioning).toHaveBeenCalledWith({ cell: 'c1' });
    // Non-destructive: fires immediately, no confirmation dialog.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hides Retry when the operation is not failed', async () => {
    api.listCellsOverview.mockResolvedValue({ rows: [overviewRow()], nextCursor: null });
    renderPage();
    await screen.findByText('dev');
    const user = userEvent.setup();
    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    expect(screen.queryByRole('menuitem', { name: 'Retry' })).toBeNull();
    expect(await screen.findByRole('menuitem', { name: 'Disable' })).toBeTruthy();
  });

  it('requires confirmation before Disable fires (AC04)', async () => {
    api.listCellsOverview.mockResolvedValue({ rows: [overviewRow()], nextCursor: null });
    api.disableCell.mockResolvedValue({});
    renderPage();
    await screen.findByText('dev');
    const user = userEvent.setup();
    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Disable' }));

    const dialog = await screen.findByRole('dialog');
    expect(api.disableCell).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Disable' }));
    expect(api.disableCell).toHaveBeenCalledWith({ cell: 'c1' });
  });

  it('hides Disable once the cell is already disabled', async () => {
    api.listCellsOverview.mockResolvedValue({
      rows: [overviewRow({ cell: { ...overviewRow().cell, enabled: false } })],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText('dev');
    expect(screen.queryByRole('menuitem', { name: 'more' })).toBeNull();
  });

  it('registers a cell and reloads the grid', async () => {
    api.listCellsOverview.mockResolvedValue({ rows: [], nextCursor: null });
    api.registerCell.mockResolvedValue({});
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('No cells registered yet.');

    await user.click(screen.getByRole('button', { name: 'Register cell' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Suffix/), 'testcell');
    await user.click(within(dialog).getByRole('button', { name: 'Register' }));

    expect(api.registerCell).toHaveBeenCalledWith({ suffix: 'testcell' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.listCellsOverview).toHaveBeenCalledTimes(2);
  });
});
