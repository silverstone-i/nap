/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Container, Typography } from '@mui/material';

/**
 * Root React component. Renders the placeholder shell until the
 * authentication and session contracts are accepted; see
 * docs/roadmap/ROADMAP.md.
 * @returns {JSX.Element}
 */
export function App() {
  return (
    <Container component="main" sx={{ py: 6 }}>
      <Typography component="h1" variant="h3">
        NAP
      </Typography>
      <Typography sx={{ mt: 2 }}>Project foundation is ready.</Typography>
    </Container>
  );
}
