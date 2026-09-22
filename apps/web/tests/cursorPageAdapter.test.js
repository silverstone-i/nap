/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest';
import { createCursorPageAdapter } from '../src/grid/cursorPageAdapter.js';

/** A fake cursor-paginated endpoint over an in-memory row array. */
function fakeEndpoint(rows) {
  return vi.fn(async ({ cursor, limit }) => {
    const start = cursor ? Number(cursor) : 0;
    const page = rows.slice(start, start + limit);
    const nextCursor =
      start + limit < rows.length ? String(start + limit) : null;
    return { rows: page, nextCursor };
  });
}

describe('createCursorPageAdapter', () => {
  it('fetches page 0 with no cursor', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const endpoint = fakeEndpoint(rows);
    const fetchPage = createCursorPageAdapter(endpoint);
    await fetchPage({ page: 0, pageSize: 2, sortModel: [], filterModel: {} });
    expect(endpoint).toHaveBeenCalledWith({ cursor: undefined, limit: 2 });
  });

  it('advances sequentially using the cached cursor from the prior page', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));
    const endpoint = fakeEndpoint(rows);
    const fetchPage = createCursorPageAdapter(endpoint);

    const page0 = await fetchPage({
      page: 0,
      pageSize: 2,
      sortModel: [],
      filterModel: {},
    });
    expect(page0.rows).toEqual([{ id: '0' }, { id: '1' }]);

    const page1 = await fetchPage({
      page: 1,
      pageSize: 2,
      sortModel: [],
      filterModel: {},
    });
    expect(page1.rows).toEqual([{ id: '2' }, { id: '3' }]);
    expect(endpoint).toHaveBeenLastCalledWith({ cursor: '2', limit: 2 });

    const page2 = await fetchPage({
      page: 2,
      pageSize: 2,
      sortModel: [],
      filterModel: {},
    });
    expect(page2.rows).toEqual([{ id: '4' }]);
  });

  it('estimates rowCount as fetched rows plus one page when more remain', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));
    const fetchPage = createCursorPageAdapter(fakeEndpoint(rows));
    const page0 = await fetchPage({
      page: 0,
      pageSize: 2,
      sortModel: [],
      filterModel: {},
    });
    expect(page0.rowCount).toBe(4); // 2 known + 1 more page's worth
  });

  it('estimates rowCount as exactly the known rows on the final page', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));
    const fetchPage = createCursorPageAdapter(fakeEndpoint(rows));
    await fetchPage({ page: 0, pageSize: 2, sortModel: [], filterModel: {} });
    await fetchPage({ page: 1, pageSize: 2, sortModel: [], filterModel: {} });
    const page2 = await fetchPage({
      page: 2,
      pageSize: 2,
      sortModel: [],
      filterModel: {},
    });
    expect(page2.rowCount).toBe(5);
  });

  it('restarts from page 0 whenever page 0 is requested again', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));
    const endpoint = fakeEndpoint(rows);
    const fetchPage = createCursorPageAdapter(endpoint);
    await fetchPage({ page: 0, pageSize: 2, sortModel: [], filterModel: {} });
    await fetchPage({ page: 1, pageSize: 2, sortModel: [], filterModel: {} });
    // Simulates a resetKey-driven reload, which always forces page back to 0.
    await fetchPage({ page: 0, pageSize: 2, sortModel: [], filterModel: {} });
    expect(endpoint).toHaveBeenLastCalledWith({ cursor: undefined, limit: 2 });
    // The cache for page 1 was dropped, so revisiting it re-fetches from page 0's cursor.
    const page1Again = await fetchPage({
      page: 1,
      pageSize: 2,
      sortModel: [],
      filterModel: {},
    });
    expect(page1Again.rows).toEqual([{ id: '2' }, { id: '3' }]);
  });

  it('resets the cache when pageSize changes', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));
    const endpoint = fakeEndpoint(rows);
    const fetchPage = createCursorPageAdapter(endpoint);
    await fetchPage({ page: 0, pageSize: 2, sortModel: [], filterModel: {} });
    await fetchPage({ page: 1, pageSize: 2, sortModel: [], filterModel: {} });
    const page1WithNewSize = await fetchPage({
      page: 1,
      pageSize: 3,
      sortModel: [],
      filterModel: {},
    });
    // Non-sequential for the new size (no cached cursor for page 1 @ size 3):
    // restarts from page 0.
    expect(endpoint).toHaveBeenLastCalledWith({ cursor: undefined, limit: 3 });
    expect(page1WithNewSize.rows).toEqual([
      { id: '0' },
      { id: '1' },
      { id: '2' },
    ]);
  });

  it('applies mapRow to every row', async () => {
    const rows = [{ cell: { id: '1' }, operation: null }];
    const fetchPage = createCursorPageAdapter(fakeEndpoint(rows), {
      mapRow: row => ({
        id: row.cell.id,
        hasOperation: row.operation !== null,
      }),
    });
    const page = await fetchPage({
      page: 0,
      pageSize: 10,
      sortModel: [],
      filterModel: {},
    });
    expect(page.rows).toEqual([{ id: '1', hasOperation: false }]);
  });
});
