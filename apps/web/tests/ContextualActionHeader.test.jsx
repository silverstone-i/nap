/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { orderActions } from '../src/shell/orderActions.js';
import { ContextualActionHeader } from '../src/shell/ContextualActionHeader.jsx';
import {
  PageHeaderProvider,
  usePageHeader,
} from '../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../src/theme/ThemeModeContext.jsx';
import { installMatchMedia } from './testUtils.jsx';

function renderHeader(page) {
  return render(
    <ThemeModeProvider>
      <PageHeaderProvider>
        <ContextualActionHeader />
        {page}
      </PageHeaderProvider>
    </ThemeModeProvider>
  );
}

function ActionsPage({ actions }) {
  usePageHeader({ title: 'Labels', actions });
  return null;
}

const ACTIONS = [
  { label: 'Add label', create: true, onClick: () => {} },
  { label: 'Export', priority: 0, onClick: () => {} },
  { label: 'Archive selected (2)', priority: 1, onClick: () => {} },
];

afterEach(cleanup);

describe('orderActions (I0001-R028)', () => {
  it('puts the create action last and the most important next to it', () => {
    expect(orderActions([...ACTIONS, false, null]).map(a => a.label)).toEqual([
      'Export',
      'Archive selected (2)',
      'Add label',
    ]);
  });
});

function TabsPage() {
  const [tabs] = useState(() => <div role="tablist" aria-label="View" />);
  usePageHeader({
    title: 'Roles',
    filters: {
      content: null,
      chips: [{ key: 'k', label: 'Kind: x', onDelete: () => {} }],
    },
    tabs,
  });
  return null;
}

describe('ContextualActionHeader', () => {
  it('renders view tabs on their own row below the title, above the chips (I0011-R002)', () => {
    installMatchMedia();
    renderHeader(<TabsPage />);
    const heading = screen.getByRole('heading', { name: 'Roles' });
    const tabs = screen.getByRole('tablist', { name: 'View' });
    const chips = screen.getByLabelText('Active filters');
    expect(heading.parentElement.contains(tabs)).toBe(false);
    const follows = (a, b) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(heading, tabs)).toBe(true);
    expect(follows(tabs, chips)).toBe(true);
  });

  it('renders an action list in order', () => {
    installMatchMedia();
    renderHeader(<ActionsPage actions={ACTIONS} />);
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual([
      'Export',
      'Archive selected (2)',
      'Add label',
    ]);
  });

  it('folds all but the create action into a ⋮ menu on a phone', async () => {
    installMatchMedia({ matches: true });
    const user = userEvent.setup();
    renderHeader(<ActionsPage actions={ACTIONS} />);
    expect(screen.getByRole('button', { name: 'Add label' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const items = within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map(item => item.textContent);
    expect(items).toEqual(['Export', 'Archive selected (2)']);
  });

  it('holds the search, the filter popover, and removable filter chips (I0001-R029)', async () => {
    installMatchMedia();
    const user = userEvent.setup();
    const onDelete = vi.fn();
    function SearchPage() {
      const [query, setQuery] = useState('');
      usePageHeader({
        title: 'Labels',
        search: { value: query, onChange: setQuery, label: 'Search labels' },
        filters: {
          content: <span>For control</span>,
          chips: [{ key: 'for', label: 'For: Email', onDelete }],
        },
      });
      return <p>Query: {query}</p>;
    }
    renderHeader(<SearchPage />);

    await user.type(
      screen.getByRole('searchbox', { name: 'Search labels' }),
      'wo'
    );
    expect(screen.getByText('Query: wo')).toBeTruthy();

    expect(screen.queryByText('For control')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    // A filter panel, never an action menu (I0001-R029).
    const panel = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(panel).getByText('For control')).toBeTruthy();
    await user.click(within(panel).getByRole('button', { name: 'Clear all' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');

    const chips = screen.getByLabelText('Active filters');
    expect(within(chips).getByText('For: Email')).toBeTruthy();
    await user.click(within(chips).getByTestId('CancelIcon'));
    expect(onDelete).toHaveBeenCalledTimes(2);
  });
});
