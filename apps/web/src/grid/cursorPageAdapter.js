/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Bridges `StandardDataGrid`'s `fetchPage({page, pageSize, sortModel,
 * filterModel}) -> {rows, rowCount}` contract to one of this module's
 * cursor-paginated list endpoints, `{cursor, limit} -> {rows, nextCursor}`
 * (F0002-R009). `rowCount` is always a disclosed estimate — rows already
 * fetched, plus one page's worth if the server reports more — never a claim
 * of an exact total the API does not provide.
 *
 * None of this feature's three screens expose sortable or filterable
 * columns (the underlying endpoints define no sort/filter query
 * parameters), so `sortModel`/`filterModel` never actually change in
 * practice; they're folded into the cache signature anyway, defensively,
 * to honor `StandardDataGrid`'s own contract. The one real "start over"
 * trigger is `StandardDataGrid`'s `resetKey`, which the component always
 * forces `page` back to `0` for internally — so `page === 0` is already the
 * correct, sufficient signal to drop the cursor cache; a post-mutation
 * reload (this feature's own lifecycle table) is driven by bumping a
 * screen-local `resetKey`, which necessarily also returns the grid to page
 * 0 — an accepted consequence of reusing `StandardDataGrid` unchanged,
 * since it exposes no other public refetch hook.
 */

/**
 * @param {(params: {cursor: string|undefined, limit: number}) => Promise<{rows: object[], nextCursor: string|null}>} fetchCursorPage
 * @param {{mapRow?: (row: object) => object}} [options] `mapRow` transforms
 *   each raw row before it reaches the grid — e.g. flattening the Cells
 *   screen's `{cell, operation}` overview row into one row object.
 * @returns {(params: {page: number, pageSize: number, sortModel: object[], filterModel: object}) => Promise<{rows: object[], rowCount: number}>}
 *   A stable `fetchPage` function for `StandardDataGrid`. Create it once per
 *   grid instance (`useMemo`/`useRef`) — a fresh instance has an empty
 *   cursor cache, which would silently defeat the cache on every render.
 */
export function createCursorPageAdapter(fetchCursorPage, { mapRow } = {}) {
  const identity = row => row;
  const project = mapRow ?? identity;
  let cursorsByPage = new Map([[0, undefined]]);
  let signature = null;

  return async function fetchPage({ page, pageSize, sortModel, filterModel }) {
    const nextSignature = JSON.stringify([pageSize, sortModel, filterModel]);
    if (nextSignature !== signature || page === 0) {
      signature = nextSignature;
      cursorsByPage = new Map([[0, undefined]]);
    }
    if (!cursorsByPage.has(page)) {
      // Non-sequential access isn't reachable through StandardDataGrid's own
      // prev/next pagination UI; restart defensively rather than throw.
      cursorsByPage = new Map([[0, undefined]]);
      page = 0;
    }
    const cursor = cursorsByPage.get(page);
    const { rows, nextCursor } = await fetchCursorPage({
      cursor,
      limit: pageSize,
    });
    if (nextCursor) cursorsByPage.set(page + 1, nextCursor);
    const knownRows = page * pageSize + rows.length;
    return {
      rows: rows.map(project),
      rowCount: nextCursor ? knownRows + pageSize : knownRows,
    };
  };
}
