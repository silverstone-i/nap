/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest';
import { createListPageAdapter } from '../src/grid/listPageAdapter.js';

const ROWS = ['a', 'b', 'c', 'd', 'e'].map(name => ({ id: name, name }));

describe('createListPageAdapter', () => {
  it('fetches once and cuts every page from that load', async () => {
    const fetchAll = vi.fn().mockResolvedValue(ROWS);
    const fetchPage = createListPageAdapter(fetchAll);

    expect(await fetchPage({ page: 0, pageSize: 2 })).toEqual({
      rows: ROWS.slice(0, 2),
      rowCount: 5,
    });
    expect((await fetchPage({ page: 2, pageSize: 2 })).rows).toEqual([ROWS[4]]);
    await fetchPage({ page: 0, pageSize: 2 });
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });

  it('narrows the loaded list with keep, without fetching again', async () => {
    const fetchAll = vi.fn().mockResolvedValue(ROWS);
    const fetchPage = createListPageAdapter(fetchAll);
    await fetchPage({ page: 0, pageSize: 25 });
    expect(
      await fetchPage({ page: 0, pageSize: 25, keep: row => row.name !== 'c' })
    ).toMatchObject({ rowCount: 4 });
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });

  it('fetches again after a failed load', async () => {
    const fetchAll = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(ROWS);
    const fetchPage = createListPageAdapter(fetchAll);
    await expect(fetchPage({ page: 0, pageSize: 2 })).rejects.toThrow('down');
    expect((await fetchPage({ page: 0, pageSize: 2 })).rowCount).toBe(5);
    expect(fetchAll).toHaveBeenCalledTimes(2);
  });
});
