/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Bridges `StandardDataGrid`'s `fetchPage` contract to an endpoint
 * that returns its whole list, such as `GET /labels` and `GET /roles`
 * (M0005-R031, M0003-R017). One adapter fetches its list once and cuts
 * every page from it in the browser, with an exact `rowCount`. A caller
 * builds a new adapter when a server-side input changes (a filter the
 * request sends, a reload after a write), and passes a browser-side filter,
 * such as a name search, as `keep` on each call, so typing never refetches.
 */

/**
 * @param {() => Promise<object[]>} fetchAll
 * @returns {(params: {page: number, pageSize: number, keep?: (row: object) => boolean}) => Promise<{rows: object[], rowCount: number}>}
 */
export function createListPageAdapter(fetchAll) {
  let list = null;
  return async ({ page, pageSize, keep = () => true }) => {
    // A failed load is forgotten, so the grid's Retry fetches again.
    list ??= fetchAll().catch(error => {
      list = null;
      throw error;
    });
    const rows = (await list).filter(keep);
    const start = page * pageSize;
    return { rows: rows.slice(start, start + pageSize), rowCount: rows.length };
  };
}
