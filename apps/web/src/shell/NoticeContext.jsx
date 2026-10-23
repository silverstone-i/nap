/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/* eslint-disable react-refresh/only-export-components --
 * The provider and its accessor hook are one unit. */

import { createContext, useCallback, useContext, useState } from 'react';
import Snackbar from '@mui/material/Snackbar';

const NoticeContext = createContext(null);

/** How long a success notice stays before it closes on its own. */
export const NOTICE_MS = 4000;

/**
 * Shows the brief success notice I0001-R032 calls for, one at a time; a
 * new notice replaces the current one.
 * @param {{children: import('react').ReactNode}} props
 * @returns {JSX.Element}
 */
export function NoticeProvider({ children }) {
  const [notice, setNotice] = useState(null);
  const notify = useCallback(
    message => setNotice({ message, key: Date.now() }),
    []
  );
  return (
    <NoticeContext.Provider value={notify}>
      {children}
      <Snackbar
        key={notice?.key}
        open={Boolean(notice)}
        message={notice?.message}
        autoHideDuration={NOTICE_MS}
        onClose={(_event, reason) => {
          if (reason !== 'clickaway') setNotice(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </NoticeContext.Provider>
  );
}

/** @returns {(message: string) => void} */
export function useNotice() {
  const notify = useContext(NoticeContext);
  if (!notify) throw new Error('useNotice must be used within NoticeProvider');
  return notify;
}
