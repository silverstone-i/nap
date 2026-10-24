/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/client.js';
import { useBulkArchive } from '../src/grid/useBulkArchive.jsx';
import { ActionBar } from '../src/shell/ActionBar.jsx';
import { NoticeProvider } from '../src/shell/NoticeContext.jsx';
import { ThemeModeProvider } from '../src/theme/ThemeModeContext.jsx';
import { installMatchMedia } from './testUtils.jsx';

const ACTIVE = [
  { id: 'a', name: 'work', revision: 1, archived: false },
  { id: 'b', name: 'home', revision: 2, archived: false },
];

/** Stands in for a grid: "Select" reports `rows` as the selection. */
function Harness({ rows, run, onDone = () => {}, archived = false }) {
  const bulk = useBulkArchive({
    canWrite: true,
    archived,
    noun: ['label', 'labels'],
    nameOf: row => row.name,
    run,
    describeError: () => 'Could not save.',
    describeItem: code => `reason ${code}`,
    onDone,
  });
  return (
    <>
      <button type="button" onClick={() => bulk.onSelectionChange([], rows)}>
        Select
      </button>
      <ActionBar actions={bulk.actions} />
      {bulk.dialogs}
    </>
  );
}

function renderHarness(props) {
  return render(
    <ThemeModeProvider>
      <NoticeProvider>
        <Harness {...props} />
      </NoticeProvider>
    </ThemeModeProvider>
  );
}

beforeEach(() => installMatchMedia());
afterEach(cleanup);

describe('useBulkArchive', () => {
  it('offers Archive selected in the Active view, confirms, sends id and revision, and notifies', async () => {
    const user = userEvent.setup();
    const run = vi.fn().mockResolvedValue(undefined);
    const onDone = vi.fn();
    renderHarness({ rows: ACTIVE, run, onDone });

    expect(screen.queryByRole('button', { name: /selected/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(
      screen.queryByRole('button', { name: /Restore selected/ })
    ).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Archive selected (2)' })
    );

    expect(screen.getByText('2 labels will be archived.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    expect(run).toHaveBeenCalledWith('archive', [
      { id: 'a', revision: 1 },
      { id: 'b', revision: 2 },
    ]);
    expect(await screen.findByText('2 labels archived.')).toBeTruthy();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('offers only Restore selected in the Archived view (I0011-R005)', async () => {
    const user = userEvent.setup();
    const run = vi.fn().mockResolvedValue(undefined);
    renderHarness({
      rows: ACTIVE.map(row => ({ ...row, archived: true })),
      run,
      archived: true,
    });
    expect(screen.queryByRole('button', { name: /selected/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(
      screen.queryByRole('button', { name: /Archive selected/ })
    ).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Restore selected (2)' })
    );
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(run).toHaveBeenCalledWith('restore', [
      { id: 'a', revision: 1 },
      { id: 'b', revision: 2 },
    ]);
  });

  it('lists each failed row by name in a dialog and changes nothing on BULK_FAILED', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const run = vi.fn().mockRejectedValue(
      new ApiError('BULK_FAILED', 409, null, {
        details: [{ id: 'b', code: 'STALE_REVISION' }],
      })
    );
    renderHarness({ rows: ACTIVE, run, onDone });
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(
      screen.getByRole('button', { name: 'Archive selected (2)' })
    );
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    expect(await screen.findByText('Nothing was changed')).toBeTruthy();
    expect(screen.getByText('home: reason STALE_REVISION')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    // The selection is kept, so the user can change it and retry.
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(
      screen.getByRole('button', { name: 'Archive selected (2)' })
    ).toBeTruthy();
  });
});
