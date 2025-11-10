import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';

const defaultToolbarState = {
  tabs: [],
  filters: [],
  primaryActions: [],
};

export const ModuleActionsContext = createContext({
  ...defaultToolbarState,
  registerToolbar: () => () => {},
  clearToolbar: () => {},
});

export function ModuleToolbarProvider({ children }) {
  const [toolbarState, setToolbarState] = useState(defaultToolbarState);

  const registerToolbar = useCallback((config) => {
    setToolbarState({
      tabs: config?.tabs ?? [],
      filters: config?.filters ?? [],
      primaryActions: config?.primaryActions ?? [],
    });

    return () => setToolbarState(defaultToolbarState);
  }, []);

  const clearToolbar = useCallback(() => setToolbarState(defaultToolbarState), []);

  const value = useMemo(
    () => ({
      ...toolbarState,
      registerToolbar,
      clearToolbar,
    }),
    [toolbarState, registerToolbar, clearToolbar]
  );

  return <ModuleActionsContext.Provider value={value}>{children}</ModuleActionsContext.Provider>;
}

export function useModuleActionsContext() {
  const ctx = useContext(ModuleActionsContext);
  if (!ctx) {
    throw new Error('useModuleActionsContext must be used within a ModuleToolbarProvider');
  }
  return ctx;
}

export function useModuleToolbarRegistration(factory, deps = []) {
  const { registerToolbar } = useModuleActionsContext();

  useEffect(() => {
    const config = typeof factory === 'function' ? factory() : factory;
    if (!config) return undefined;
    const cleanup = registerToolbar(config);
    return cleanup;
    // We rely on the caller-provided deps array to control re-registration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerToolbar, ...deps]);
}
