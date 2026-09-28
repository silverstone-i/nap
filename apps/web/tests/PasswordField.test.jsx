/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PasswordField } from '../src/components/PasswordField.jsx';

afterEach(cleanup);

describe('PasswordField', () => {
  it('hides the value until the toggle shows it, and hides it again', async () => {
    render(
      <PasswordField label="Password" value="secret" onChange={() => {}} />
    );
    const user = userEvent.setup();
    const input = screen.getByLabelText('Password', { selector: 'input' });
    expect(input.getAttribute('type')).toBe('password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input.getAttribute('type')).toBe('text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input.getAttribute('type')).toBe('password');
  });

  it("keeps the caller's input slot props and end adornment", () => {
    render(
      <PasswordField
        label="Password"
        value=""
        onChange={() => {}}
        slotProps={{
          input: {
            endAdornment: <span>caller</span>,
            inputProps: { 'data-testid': 'field' },
          },
        }}
      />
    );
    expect(screen.getByText('caller')).toBeTruthy();
    expect(screen.getByTestId('field')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy();
  });
});
