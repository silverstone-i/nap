/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/* eslint-disable react-refresh/only-export-components --
 * The provider and its two accessor hooks are one unit. */

import { createContext, useContext, useEffect, useState } from 'react';

// Two contexts, not one: `useState`'s setter is already referentially
// stable across renders, but bundling it into one object with the
// changing `header` value (the earlier single-context shape) forced every
// `usePageHeader` caller — a context consumer through `SetPageHeaderContext`
// alone — to also re-render whenever `header` changed. A page passing a
// fresh `actions` node each render (any dynamic header action, e.g. I0002's
// "Create tenant" button) would then recreate that node on the resulting
// re-render, changing `usePageHeader`'s effect dependency, calling
// `setHeader` again, and looping forever. Splitting the setter out means
// `usePageHeader` only ever consumes a value that never changes.
const PageHeaderContext = createContext(null);
const SetPageHeaderContext = createContext(null);

const EMPTY_HEADER = { title: '', actions: null, search: null, filters: null };

/**
 * @typedef {object} HeaderSearch
 * @property {string} value
 * @property {(value: string) => void} onChange
 * @property {string} [placeholder]
 * @property {string} [label] Accessible name; defaults to "Search".
 */

/**
 * @typedef {object} HeaderFilters
 * @property {import('react').ReactNode} content The filter controls the popover holds.
 * @property {Array<{key: string, label: string, onDelete: () => void}>} [chips] One per active filter.
 */

/**
 * @typedef {object} PageHeader
 * @property {string} title
 * @property {Array<import('./orderActions.js').ScreenAction|null|false|undefined>|null} actions
 *   In I0001-R028 order once rendered; falsy entries are dropped.
 * @property {HeaderSearch|null} search
 * @property {HeaderFilters|null} filters
 */

/** Holds whatever the active page has registered for the contextual action header (I0001 §5). */
export function PageHeaderProvider({ children }) {
  const [header, setHeader] = useState(EMPTY_HEADER);
  return (
    <SetPageHeaderContext.Provider value={setHeader}>
      <PageHeaderContext.Provider value={header}>
        {children}
      </PageHeaderContext.Provider>
    </SetPageHeaderContext.Provider>
  );
}

/** @returns {PageHeader} */
export function usePageHeaderValue() {
  const header = useContext(PageHeaderContext);
  if (!header)
    throw new Error(
      'usePageHeaderValue must be used within PageHeaderProvider'
    );
  return header;
}

/**
 * Register this page's title, search, filters, and actions for the shell's
 * contextual action header to render (I0001-R028, R029). Also sets
 * `document.title`.
 * @param {{
 *   title: string,
 *   actions?: PageHeader['actions'],
 *   search?: HeaderSearch|null,
 *   filters?: HeaderFilters|null,
 * }} options
 * @returns {void}
 */
export function usePageHeader({
  title,
  actions = null,
  search = null,
  filters = null,
}) {
  const setHeader = useContext(SetPageHeaderContext);
  if (!setHeader)
    throw new Error('usePageHeader must be used within PageHeaderProvider');
  useEffect(() => {
    setHeader({ title, actions, search, filters });
    document.title = title ? `${title} · nap.` : 'nap.';
    return () => {
      setHeader(EMPTY_HEADER);
      document.title = 'nap.';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, actions, search, filters]);
}
