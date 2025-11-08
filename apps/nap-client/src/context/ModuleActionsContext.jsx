import { createContext, useContext } from 'react';

export const ModuleActionsContext = createContext(null);

export function useModuleActionsContext() {
  return useContext(ModuleActionsContext);
}
