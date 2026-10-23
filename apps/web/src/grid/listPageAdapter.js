/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Bridges `StandardDataGrid`'s `fetchPage` contract to an endpoint
 * that returns its whole list, such as `GET /labels` and `GET /roles`
 * (M0005-R031, M0003-R017). The list is fetched once per `page === 0`
 * request (the grid returns to page 0 whenever its `resetKey` changes) and
 * later pages are cut from it in the browser, with an exact `rowCount`.
 */

/**
 * @param {() => Promise<object[]>} fetchAll
 * @param {(row: object) => boolean} [keep] Narrows the list in the browser, such as a name search.
 * @returns {(params: {page: number, pageSize: number}) => Promise<{rows: object[], rowCount: number}>}
 */
export function createListPageAdapter(fetchAll, keep = () => true) {
  let list = null;
  return async ({ page, pageSize }) => {
    if (page === 0 || list === null) list = (await fetchAll()).filter(keep);
    const start = page * pageSize;
    return { rows: list.slice(start, start + pageSize), rowCount: list.length };
  };
}
