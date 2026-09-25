/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { ContextualActionHeader } from './ContextualActionHeader.jsx';
import { NavDrawer } from './NavDrawer.jsx';
import { PageHeaderProvider } from './PageHeaderContext.jsx';
import { TopHeader } from './TopHeader.jsx';

/**
 * The application shell (I0001-R009): a full-width top header above a
 * left-navigation-plus-work-area row. The hamburger's effect depends on the
 * breakpoint: at phone widths it opens and closes a modal drawer (icons and
 * labels, R013); at tablet and desktop it toggles the in-flow rail between
 * expanded (icons and labels) and collapsed (icons only, with tooltips) —
 * navigation is never fully hidden at those widths.
 * @param {{homePath: string, area: 'platform'|'tenant', children: import('react').ReactNode}} props
 * @returns {JSX.Element}
 */
export function AppShell({ homePath, area, children }) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [phoneNavOpen, setPhoneNavOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState(true);
  const location = useLocation();
  const headingRef = useRef(null);

  // Close the phone modal nav on every navigation. Adjusted directly
  // during render (React's "adjusting state when a prop changes" pattern)
  // rather than in an effect, since there is no external system to
  // synchronize with — only derived UI state.
  const [renderedPathname, setRenderedPathname] = useState(location.pathname);
  if (renderedPathname !== location.pathname) {
    setRenderedPathname(location.pathname);
    if (phoneNavOpen) setPhoneNavOpen(false);
  }

  useEffect(() => {
    headingRef.current?.focus();
  }, [location.pathname]);

  const toggleNav = () =>
    isPhone ? setPhoneNavOpen(open => !open) : setNavExpanded(open => !open);

  return (
    <PageHeaderProvider>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <TopHeader onMenuClick={toggleNav} />
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <NavDrawer
            homePath={homePath}
            area={area}
            variant={isPhone ? 'temporary' : 'rail'}
            expanded={navExpanded}
            open={phoneNavOpen}
            onClose={() => setPhoneNavOpen(false)}
          />
          <Box
            component="main"
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'auto',
            }}
          >
            <ContextualActionHeader headingRef={headingRef} />
            <Box sx={{ flex: 1, p: 3, minWidth: 0 }}>{children}</Box>
          </Box>
        </Box>
      </Box>
    </PageHeaderProvider>
  );
}
