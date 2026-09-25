/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavGroup } from '../src/shell/NavGroup.jsx';
import { ThemeModeProvider } from '../src/theme/ThemeModeContext.jsx';
import { installMatchMedia } from './testUtils.jsx';

function children(overrides = {}) {
  return [
    {
      id: 'a',
      icon: <span aria-hidden="true">IconA</span>,
      label: 'Alpha',
      active: false,
    },
    {
      id: 'b',
      icon: <span aria-hidden="true">IconB</span>,
      label: 'Beta',
      active: false,
    },
    ...(overrides.extra ?? []),
  ];
}

function renderGroup(props) {
  return render(
    <ThemeModeProvider>
      <NavGroup
        icon={<span aria-hidden="true">GroupIcon</span>}
        label="Tenant Management"
        expanded
        children={children()}
        onSelect={vi.fn()}
        {...props}
      />
    </ThemeModeProvider>
  );
}

beforeEach(() => {
  installMatchMedia();
});

afterEach(() => {
  cleanup();
});

describe('NavGroup — empty group (I0001-R023, AC16)', () => {
  it('renders nothing when there are no visible children', () => {
    renderGroup({ children: [] });
    expect(screen.queryByText('Tenant Management')).toBeNull();
  });
});

describe('NavGroup — expanded (phone drawer and expanded rail)', () => {
  it('nests visible children under the group header with icons and labels', () => {
    renderGroup({ expanded: true });
    expect(screen.getByText('Tenant Management')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('toggles children visibility when the header is activated (group expansion)', async () => {
    const user = userEvent.setup();
    renderGroup({ expanded: true });
    const header = screen
      .getByText('Tenant Management')
      .closest('div[role="button"], div');

    expect(screen.getByText('Alpha')).toBeTruthy();
    await user.click(screen.getByText('Tenant Management'));
    await waitFor(() => expect(screen.queryByText('Alpha')).toBeNull());
    await user.click(screen.getByText('Tenant Management'));
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
    expect(header).toBeTruthy();
  });

  it('highlights the active child', () => {
    renderGroup({
      expanded: true,
      children: [
        {
          id: 'a',
          icon: <span aria-hidden="true">IconA</span>,
          label: 'Alpha',
          active: false,
        },
        {
          id: 'b',
          icon: <span aria-hidden="true">IconB</span>,
          label: 'Beta',
          active: true,
        },
      ],
    });
    const activeRow = screen.getByText('Beta').closest('.MuiButtonBase-root');
    const inactiveRow = screen
      .getByText('Alpha')
      .closest('.MuiButtonBase-root');
    expect(activeRow.classList.contains('Mui-selected')).toBe(true);
    expect(inactiveRow.classList.contains('Mui-selected')).toBe(false);
  });

  it('calls onSelect with the child id when a child is activated', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderGroup({ expanded: true, onSelect });
    await user.click(screen.getByText('Alpha'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});

describe('NavGroup — collapsed rail', () => {
  it('shows only the group icon, identified by an accessible name (tooltip)', () => {
    renderGroup({ expanded: false });
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Tenant Management' })
    ).toBeTruthy();
  });

  it('shows a visible tooltip on hover', async () => {
    const user = userEvent.setup();
    renderGroup({ expanded: false });
    await user.hover(screen.getByRole('button', { name: 'Tenant Management' }));
    expect(
      await screen.findByRole('tooltip', { name: 'Tenant Management' })
    ).toBeTruthy();
  });

  it('opens an accessible flyout with child icons and labels on click, and closes on selection', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderGroup({ expanded: false, onSelect });
    const trigger = screen.getByRole('button', { name: 'Tenant Management' });

    await user.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(menu).toBeTruthy();
    const betaItem = screen.getByRole('menuitem', { name: 'Beta' });
    expect(betaItem).toBeTruthy();

    await user.click(betaItem);
    expect(onSelect).toHaveBeenCalledWith('b');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('supports keyboard operation: Enter opens the flyout, focus moves into it, and Escape closes and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderGroup({ expanded: false });
    const trigger = screen.getByRole('button', { name: 'Tenant Management' });

    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('role')).toBe('menuitem')
    );

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('highlights the active child inside the flyout', async () => {
    const user = userEvent.setup();
    renderGroup({
      expanded: false,
      children: [
        {
          id: 'a',
          icon: <span aria-hidden="true">IconA</span>,
          label: 'Alpha',
          active: false,
        },
        {
          id: 'b',
          icon: <span aria-hidden="true">IconB</span>,
          label: 'Beta',
          active: true,
        },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Tenant Management' }));
    const betaItem = await screen.findByRole('menuitem', { name: 'Beta' });
    expect(betaItem.classList.contains('Mui-selected')).toBe(true);
  });
});
