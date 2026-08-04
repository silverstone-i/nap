/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeModeProvider } from '../src/theme/ThemeModeProvider';
import { App } from '../src/App';

// Auto-cleanup needs vitest globals, which are off — clean up explicitly.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderAt(path: string) {
  return render(
    <ThemeModeProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ThemeModeProvider>
  );
}

test('renders the shell and inbox for the entity in the URL', () => {
  renderAt('/silverstone/inbox');

  // Shell: wordmark and nav destinations.
  expect(screen.getByText('nap')).toBeTruthy();
  expect(screen.getByText('Projects')).toBeTruthy();
  expect(screen.getByText('Accounts Payable')).toBeTruthy();

  // A seeded inbox item for the URL's entity renders.
  expect(
    screen.getByText('Approve invoice AP-1002 — Cascade Steel Fabricators')
  ).toBeTruthy();
});

test('unknown entity ids (e.g. old entity-less URLs) redirect to the default entity inbox', () => {
  renderAt('/inbox');
  expect(
    screen.getByText('Approve invoice AP-1002 — Cascade Steel Fabricators')
  ).toBeTruthy();
});

test('/ lands on the last explicitly-switched entity', () => {
  window.localStorage.setItem('nap:entity', 'harbor');
  renderAt('/');
  expect(
    screen.getByText('Approve invoice AP-2002 — Pacific Concrete Group')
  ).toBeTruthy();
});

test('switching entity rewrites the URL segment and rescopes the screen', () => {
  renderAt('/silverstone/inbox');

  // MUI Select: open the listbox, then pick the option.
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Entity' }));
  fireEvent.click(
    screen.getByRole('option', { name: 'Harbor Development Corp' })
  );

  // The inbox now shows the new entity's items, and the switch persists as
  // the default for entity-less URLs.
  expect(
    screen.getByText('Approve invoice AP-2002 — Pacific Concrete Group')
  ).toBeTruthy();
  expect(
    screen.queryByText('Approve invoice AP-1002 — Cascade Steel Fabricators')
  ).toBeNull();
  expect(window.localStorage.getItem('nap:entity')).toBe('harbor');
});

test('theme menu persists an explicit dark preference', () => {
  renderAt('/silverstone/inbox');

  fireEvent.click(screen.getByLabelText('Account'));
  fireEvent.click(screen.getByText('Dark'));
  expect(window.localStorage.getItem('nap:theme-mode')).toBe('dark');

  // Back to system clears the override rather than storing it.
  fireEvent.click(screen.getByText('System'));
  expect(window.localStorage.getItem('nap:theme-mode')).toBeNull();
});
