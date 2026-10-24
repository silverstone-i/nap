/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ArchiveViewTabs } from '../src/grid/ArchiveViewTabs.jsx';
import { useArchiveView } from '../src/grid/useArchiveView.js';

/** The tabs wired to the URL, with the current query shown for assertions. */
function Harness() {
  const [archived, setArchived] = useArchiveView();
  const { search } = useLocation();
  return (
    <>
      <ArchiveViewTabs archived={archived} onChange={setArchived} />
      <output aria-label="query">{search}</output>
    </>
  );
}

function renderAt(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Harness />
    </MemoryRouter>
  );
}

const selected = name =>
  screen.getByRole('tab', { name }).getAttribute('aria-selected');

afterEach(cleanup);

describe('ArchiveViewTabs with useArchiveView (I0011-R003)', () => {
  it('opens on Active without a view and on Archived with view=archived', () => {
    renderAt('/x');
    expect(selected('Active')).toBe('true');
    cleanup();
    renderAt('/x?view=archived');
    expect(selected('Archived')).toBe('true');
    cleanup();
    renderAt('/x?view=other');
    expect(selected('Active')).toBe('true');
  });

  it('writes the view to the URL and keeps other parameters', async () => {
    const user = userEvent.setup();
    renderAt('/x?q=work');
    await user.click(screen.getByRole('tab', { name: 'Archived' }));
    expect(selected('Archived')).toBe('true');
    expect(screen.getByLabelText('query').textContent).toBe(
      '?q=work&view=archived'
    );
    await user.click(screen.getByRole('tab', { name: 'Active' }));
    expect(screen.getByLabelText('query').textContent).toBe('?q=work');
  });
});
