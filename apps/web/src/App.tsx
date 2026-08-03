/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Placeholder landing page. The app shell and mock-data walkthrough land with
// PRD 0001; until then this page carries only the brand (BRAND.md): wordmark
// with the square gold logo dot, descriptor, nothing else.
export default function App() {
  return (
    <main className="landing">
      <h1 className="wordmark" aria-label="NAP">
        nap
        <span className="wordmark-dot" aria-hidden="true" />
      </h1>
      <p className="descriptor">Project-first accounting &amp; ERP</p>
    </main>
  );
}
