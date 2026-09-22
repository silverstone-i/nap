/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/* eslint-disable react-refresh/only-export-components --
 * The provider and its two accessor hooks are one unit. */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const PageHeaderContext = createContext(null);

/** Holds whatever the active page has registered for the contextual action header (F0001 §5). */
export function PageHeaderProvider({ children }) {
  const [header, setHeader] = useState({ title: '', actions: null });
  const value = useMemo(() => ({ header, setHeader }), [header]);
  return (
    <PageHeaderContext.Provider value={value}>
      {children}
    </PageHeaderContext.Provider>
  );
}

/** @returns {{title: string, actions: import('react').ReactNode|null}} */
export function usePageHeaderValue() {
  const context = useContext(PageHeaderContext);
  if (!context)
    throw new Error(
      'usePageHeaderValue must be used within PageHeaderProvider'
    );
  return context.header;
}

/**
 * Register this page's title and contextual actions for the shell's
 * contextual action header to render. Also sets `document.title`.
 * @param {{title: string, actions?: import('react').ReactNode}} options
 * @returns {void}
 */
export function usePageHeader({ title, actions = null }) {
  const context = useContext(PageHeaderContext);
  if (!context)
    throw new Error('usePageHeader must be used within PageHeaderProvider');
  const { setHeader } = context;
  useEffect(() => {
    setHeader({ title, actions });
    document.title = title ? `${title} · nap.` : 'nap.';
    return () => setHeader({ title: '', actions: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, actions]);
}
