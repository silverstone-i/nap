/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints.js';
import { useSession } from '../../src/auth/SessionContext.jsx';
import { CellsPage } from '../../src/pages/management/CellsPage.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { NoticeProvider } from '../../src/shell/NoticeContext.jsx';
import { PageHeaderProvider } from '../../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../../src/theme/ThemeModeContext.jsx';
import {
  capabilitiesFixture,
  installMatchMedia,
  installResizeObserver,
} from '../testUtils.jsx';

vi.mock('../../src/api/endpoints.js', () => ({
  listCellsOverview: vi.fn(),
  registerCell: vi.fn(),
  retryCellProvisioning: vi.fn(),
  disableCell: vi.fn(),
  activateCell: vi.fn(),
  seedCell: vi.fn(),
  rolloutReferenceData: vi.fn(),
}));

vi.mock('../../src/auth/SessionContext.jsx', () => ({
  useSession: vi.fn(),
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
      <NoticeProvider>
        <PageHeaderProvider>
          <ContextualActionHeader />
          <CellsPage />
        </PageHeaderProvider>
      </NoticeProvider>
    </ThemeModeProvider>
  );
}

beforeEach(() => {
  installMatchMedia();
  installResizeObserver();
  useSession.mockReturnValue({
    capabilities: capabilitiesFixture(),
    refreshCapabilities: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CellsPage', () => {
  it('shows Environment, Database, Enabled, and Status, with the stage in the detail (I0003-R044)', async () => {
    api.listCellsOverview.mockResolvedValue({
      rows: [overviewRow()],
      nextCursor: null,
    });
    renderPage();
    expect(await screen.findByText('dev')).toBeTruthy();
    expect(screen.getByText('nap_dev_cell_acme')).toBeTruthy();
    expect(screen.getByText('queued')).toBeTruthy();
    expect(screen.queryByText('registered')).toBeNull();
    const headers = screen
      .getAllByRole('columnheader')
      .map(header => header.textContent)
      .filter(Boolean);
    expect(headers).toEqual(['Environment', 'Database', 'Enabled', 'Status']);
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
      rows: [
        overviewRow({
          operation: { ...overviewRow().operation, status: 'failed' },
        }),
      ],
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
    // I0003-R046
    expect(
      await screen.findByText('nap_dev_cell_acme retry queued.')
    ).toBeTruthy();
  });

  it('hides Retry when the operation is not failed', async () => {
    api.listCellsOverview.mockResolvedValue({
      rows: [overviewRow()],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText('dev');
    const user = userEvent.setup();
    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    expect(screen.queryByRole('menuitem', { name: 'Retry' })).toBeNull();
    expect(
      await screen.findByRole('menuitem', { name: 'Disable' })
    ).toBeTruthy();
  });

  it('requires confirmation before Disable fires (AC04)', async () => {
    api.listCellsOverview.mockResolvedValue({
      rows: [overviewRow()],
      nextCursor: null,
    });
    api.disableCell.mockResolvedValue({});
    renderPage();
    await screen.findByText('dev');
    const user = userEvent.setup();
    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Disable' }));

    const dialog = await screen.findByRole('dialog', { name: 'Disable cell?' });
    expect(
      within(dialog).getByText(
        'The cell stops serving until you activate it again.'
      )
    ).toBeTruthy();
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
    // Nothing applies to a disabled cell whose job is still queued.
    expect(screen.queryByRole('menuitem', { name: 'more' })).toBeNull();
  });

  it('shows the failure code in the detail (I0003 AC11, R044)', async () => {
    api.listCellsOverview.mockResolvedValue({
      rows: [
        overviewRow({
          operation: {
            ...overviewRow().operation,
            stage: 'migration',
            status: 'failed',
            failure_code: 'MIGRATION_FAILED',
          },
        }),
      ],
      nextCursor: null,
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'nap_dev_cell_acme' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('MIGRATION_FAILED')).toBeTruthy();
  });

  it('refreshes every 2 seconds while a job is active, and stops after (I0003 AC11)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const done = overviewRow({
        operation: {
          ...overviewRow().operation,
          stage: 'complete',
          status: 'completed',
        },
      });
      api.listCellsOverview
        .mockResolvedValueOnce({
          rows: [overviewRow()],
          nextCursor: null,
          anyActive: true,
        })
        .mockResolvedValue({
          rows: [done],
          nextCursor: null,
          anyActive: false,
        });
      renderPage();
      await screen.findByText('queued');
      expect(api.listCellsOverview).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      await screen.findByText('completed');
      const calls = api.listCellsOverview.mock.calls.length;
      await vi.advanceTimersByTimeAsync(6000);
      expect(api.listCellsOverview).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps an open detail in step with the refresh (I0003-R044)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const failed = overviewRow({
        operation: { ...overviewRow().operation, status: 'failed' },
      });
      api.listCellsOverview
        .mockResolvedValueOnce({
          rows: [overviewRow()],
          nextCursor: null,
          anyActive: true,
        })
        .mockResolvedValue({ rows: [failed], nextCursor: null });
      renderPage();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(
        await screen.findByRole('button', { name: 'nap_dev_cell_acme' })
      );
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).queryByRole('button', { name: 'Retry' })
      ).toBeNull();
      await vi.advanceTimersByTimeAsync(2000);
      expect(
        await within(dialog).findByRole('button', { name: 'Retry' })
      ).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps refreshing while a job on another page is active (I0003-R030)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const done = overviewRow({
        operation: {
          ...overviewRow().operation,
          stage: 'complete',
          status: 'completed',
        },
      });
      api.listCellsOverview.mockResolvedValue({
        rows: [done],
        nextCursor: 'next',
        anyActive: true,
      });
      renderPage();
      await screen.findByText('completed');
      const calls = api.listCellsOverview.mock.calls.length;
      await vi.advanceTimersByTimeAsync(2000);
      await vi.waitFor(() =>
        expect(api.listCellsOverview.mock.calls.length).toBeGreaterThan(calls)
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the cell detail from its database name, with the next action and its actions (I0003 AC11, R044)', async () => {
    api.listCellsOverview.mockResolvedValue({
      rows: [
        overviewRow({
          operation: {
            ...overviewRow().operation,
            stage: 'setup',
            status: 'failed',
            attempts: 2,
            failure_code: 'TARGET_NOT_OWNED',
          },
        }),
      ],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText('dev');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'nap_dev_cell_acme' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'nap_dev_cell_acme',
    });
    expect(within(dialog).getByText('setup')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(
      within(dialog).getByRole('button', { name: 'Disable' })
    ).toBeTruthy();
    expect(within(dialog).getByText('c1')).toBeTruthy();
    expect(within(dialog).getByText('TARGET_NOT_OWNED')).toBeTruthy();
    expect(within(dialog).getByText('2')).toBeTruthy();
    expect(
      within(dialog).getByText(
        'Fix the cause of the failure, then choose Retry.'
      )
    ).toBeTruthy();
  });

  it('offers Activate only for a disabled cell whose job completed (I0003 AC11)', async () => {
    const completed = {
      ...overviewRow().operation,
      stage: 'complete',
      status: 'completed',
    };
    api.listCellsOverview.mockResolvedValue({
      rows: [
        overviewRow({
          cell: { ...overviewRow().cell, enabled: false },
          operation: completed,
        }),
      ],
      nextCursor: null,
    });
    api.activateCell.mockResolvedValue({});
    renderPage();
    await screen.findByText('dev');
    const user = userEvent.setup();
    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Activate' }));
    expect(api.activateCell).toHaveBeenCalledWith({ cell: 'c1' });
    cleanup();

    api.listCellsOverview.mockResolvedValue({
      rows: [overviewRow({ operation: completed })],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText('dev');
    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    await screen.findByRole('menuitem', { name: 'Disable' });
    expect(screen.queryByRole('menuitem', { name: 'Activate' })).toBeNull();
  });

  it('adds a cell with New cell, shows a notice, and reloads the grid (I0003-R045, R046)', async () => {
    api.listCellsOverview.mockResolvedValue({ rows: [], nextCursor: null });
    api.registerCell.mockResolvedValue({});
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('No cells registered yet.');

    await user.click(screen.getByRole('button', { name: 'New cell' }));
    const dialog = await screen.findByRole('dialog', { name: 'New cell' });
    const suffix = within(dialog).getByLabelText(/Suffix/);
    // I0003-R045: the helper shows only while the suffix is invalid.
    expect(within(dialog).queryByText(/lowercase letters/)).toBeNull();
    await user.type(suffix, 'Bad_');
    expect(within(dialog).getByText(/lowercase letters/)).toBeTruthy();
    await user.clear(suffix);
    await user.type(suffix, 'testcell');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(api.registerCell).toHaveBeenCalledWith({ suffix: 'testcell' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('Cell registered.')).toBeTruthy();
    expect(api.listCellsOverview).toHaveBeenCalledTimes(2);
  });

  it('hides New cell and the write actions without control write (I0005-R011)', async () => {
    useSession.mockReturnValue({
      capabilities: capabilitiesFixture({
        patterns: ['NAP::admin-tenancy::control::read'],
      }),
      refreshCapabilities: vi.fn(),
    });
    api.listCellsOverview.mockResolvedValue({
      rows: [
        overviewRow({
          operation: { ...overviewRow().operation, status: 'failed' },
        }),
      ],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText('dev');
    expect(screen.queryByRole('button', { name: 'New cell' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'more' })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'nap_dev_cell_acme' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  describe('reference-data rollout (I0007)', () => {
    const counts = overrides => ({
      declaredVersion: 3,
      current: 1,
      missing: 2,
      queued: 0,
      running: 0,
      failed: 0,
      ...overrides,
    });
    const missingRow = () =>
      overviewRow({
        operation: {
          ...overviewRow().operation,
          stage: 'complete',
          status: 'completed',
        },
        seedState: 'missing',
      });

    it('hides the panel when every cell is current', async () => {
      api.listCellsOverview.mockResolvedValue({
        rows: [overviewRow()],
        nextCursor: null,
        referenceSeed: counts({ current: 1, missing: 0 }),
      });
      renderPage();
      await screen.findByText('dev');
      expect(screen.queryByText(/Reference data version/)).toBeNull();
    });

    it('confirms and runs a rollout from the header, then reports the result as a notice (R011, R012, R021, R022)', async () => {
      api.listCellsOverview.mockResolvedValue({
        rows: [missingRow()],
        nextCursor: null,
        referenceSeed: counts(),
      });
      api.rolloutReferenceData.mockResolvedValue({
        declaredVersion: 3,
        queued: ['c1', 'c2'],
        skipped: [],
      });
      renderPage();
      expect(await screen.findByText('Reference data version 3')).toBeTruthy();
      // R021: only the counts above zero.
      expect(screen.getByText('Current 1 · Missing 2')).toBeTruthy();
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', { name: 'Roll out reference data' })
      );
      const dialog = await screen.findByRole('dialog', {
        name: 'Roll out reference data?',
      });
      expect(
        within(dialog).getByText('Version 3 loads into 2 cells.')
      ).toBeTruthy();
      await user.click(
        within(dialog).getByRole('button', { name: 'Roll out' })
      );
      expect(api.rolloutReferenceData).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Queued 2 cells.')).toBeTruthy();
    });

    it('offers Load reference data for a missing cell (R013)', async () => {
      api.listCellsOverview.mockResolvedValue({
        rows: [missingRow()],
        nextCursor: null,
        referenceSeed: counts({ missing: 1 }),
      });
      api.seedCell.mockResolvedValue({});
      renderPage();
      await screen.findByText('dev');
      const user = userEvent.setup();
      await user.click(screen.getByRole('menuitem', { name: 'more' }));
      await user.click(
        await screen.findByRole('menuitem', { name: 'Load reference data' })
      );
      expect(api.seedCell).toHaveBeenCalledWith({ cell: 'c1' });
    });

    it('shows the panel but no rollout actions without control write', async () => {
      useSession.mockReturnValue({
        capabilities: capabilitiesFixture({
          patterns: ['NAP::admin-tenancy::control::read'],
        }),
        refreshCapabilities: vi.fn(),
      });
      api.listCellsOverview.mockResolvedValue({
        rows: [missingRow()],
        nextCursor: null,
        referenceSeed: counts(),
      });
      renderPage();
      await screen.findByText('dev');
      expect(screen.getByText('Reference data version 3')).toBeTruthy();
      expect(
        screen.queryByRole('button', { name: 'Roll out reference data' })
      ).toBeNull();
      expect(screen.queryByRole('menuitem', { name: 'more' })).toBeNull();
    });
  });
});
