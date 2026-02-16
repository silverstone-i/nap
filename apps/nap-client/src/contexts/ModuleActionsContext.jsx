/**
 * @file Module Actions context — toolbar registration for tabs, filters, primary actions
 * @module nap-client/contexts/ModuleActionsContext
 *
 * Pages call useModuleToolbarRegistration(config) to register their toolbar
 * items (tabs, filters, primaryActions). The ModuleBar reads these from context.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const ModuleActionsContext = createContext(null);

const EMPTY = { tabs: [], filters: [], primaryActions: [] };

export function ModuleActionsProvider({ children }) {
  const [actions, setActions] = useState(EMPTY);

  const register = useCallback((config) => {
    setActions({
      tabs: config.tabs || [],
      filters: config.filters || [],
      primaryActions: config.primaryActions || [],
    });
  }, []);

  const clear = useCallback(() => setActions(EMPTY), []);

  const value = useMemo(() => ({ actions, register, clear }), [actions, register, clear]);

  return (
    <ModuleActionsContext.Provider value={value}>
      {children}
    </ModuleActionsContext.Provider>
  );
}

/**
 * Hook for pages to register their module toolbar configuration.
 * Automatically clears on unmount.
 */
export function useModuleToolbarRegistration(config) {
  const ctx = useContext(ModuleActionsContext);
  if (!ctx) throw new Error('useModuleToolbarRegistration must be used within ModuleActionsProvider');

  useEffect(() => {
    if (config) ctx.register(config);
    return () => ctx.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);
}

export function useModuleActions() {
  const ctx = useContext(ModuleActionsContext);
  if (!ctx) throw new Error('useModuleActions must be used within ModuleActionsProvider');
  return ctx;
}

export default ModuleActionsContext;
