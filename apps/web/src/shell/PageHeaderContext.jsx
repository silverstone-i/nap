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
// fresh `actions` node each render (any dynamic header action, e.g. F0002's
// "Create tenant" button) would then recreate that node on the resulting
// re-render, changing `usePageHeader`'s effect dependency, calling
// `setHeader` again, and looping forever. Splitting the setter out means
// `usePageHeader` only ever consumes a value that never changes.
const PageHeaderContext = createContext(null);
const SetPageHeaderContext = createContext(null);

/** Holds whatever the active page has registered for the contextual action header (F0001 §5). */
export function PageHeaderProvider({ children }) {
  const [header, setHeader] = useState({ title: '', actions: null });
  return (
    <SetPageHeaderContext.Provider value={setHeader}>
      <PageHeaderContext.Provider value={header}>
        {children}
      </PageHeaderContext.Provider>
    </SetPageHeaderContext.Provider>
  );
}

/** @returns {{title: string, actions: import('react').ReactNode|null}} */
export function usePageHeaderValue() {
  const header = useContext(PageHeaderContext);
  if (!header)
    throw new Error(
      'usePageHeaderValue must be used within PageHeaderProvider'
    );
  return header;
}

/**
 * Register this page's title and contextual actions for the shell's
 * contextual action header to render. Also sets `document.title`.
 * @param {{title: string, actions?: import('react').ReactNode}} options
 * @returns {void}
 */
export function usePageHeader({ title, actions = null }) {
  const setHeader = useContext(SetPageHeaderContext);
  if (!setHeader)
    throw new Error('usePageHeader must be used within PageHeaderProvider');
  useEffect(() => {
    setHeader({ title, actions });
    document.title = title ? `${title} · nap.` : 'nap.';
    return () => setHeader({ title: '', actions: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, actions]);
}
