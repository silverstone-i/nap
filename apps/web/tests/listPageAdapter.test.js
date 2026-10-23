/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest';
import { createListPageAdapter } from '../src/grid/listPageAdapter.js';

const ROWS = ['a', 'b', 'c', 'd', 'e'].map(name => ({ id: name, name }));

describe('createListPageAdapter', () => {
  it('cuts pages from one fetch and refetches on page 0', async () => {
    const fetchAll = vi.fn().mockResolvedValue(ROWS);
    const fetchPage = createListPageAdapter(fetchAll);

    expect(await fetchPage({ page: 0, pageSize: 2 })).toEqual({
      rows: ROWS.slice(0, 2),
      rowCount: 5,
    });
    expect((await fetchPage({ page: 2, pageSize: 2 })).rows).toEqual([ROWS[4]]);
    expect(fetchAll).toHaveBeenCalledTimes(1);

    await fetchPage({ page: 0, pageSize: 2 });
    expect(fetchAll).toHaveBeenCalledTimes(2);
  });

  it('narrows the list before counting it', async () => {
    const fetchPage = createListPageAdapter(
      async () => ROWS,
      row => row.name !== 'c'
    );
    expect(await fetchPage({ page: 0, pageSize: 25 })).toMatchObject({
      rowCount: 4,
    });
  });
});
