/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { formatPhoneInput, formatTaxIdInput } from '@nap/shared';
import { FormattedField } from '../src/components/FormattedField.jsx';

afterEach(cleanup);

function Field({ format, initial = '' }) {
  const [value, setValue] = useState(initial);
  return (
    <FormattedField
      label="Field"
      value={value}
      onChange={setValue}
      format={format}
    />
  );
}

const ssn = input => formatTaxIdInput(input, '###-##-####');

function setup(format, initial) {
  render(<Field format={format} initial={initial} />);
  return {
    user: userEvent.setup(),
    input: screen.getByLabelText('Field', { selector: 'input' }),
  };
}

describe('FormattedField', () => {
  it('formats a tax ID into its mask as it is typed', async () => {
    const { user, input } = setup(ssn);
    await user.type(input, '333224444');
    expect(input.value).toBe('333-22-4444');
  });

  it('keeps the caret after the same digit when editing mid-value', async () => {
    const { user, input } = setup(ssn, '333-22-444');
    input.setSelectionRange(5, 5);
    await user.type(input, '9', {
      initialSelectionStart: 5,
      initialSelectionEnd: 5,
    });
    expect(input.value).toBe('333-29-2444');
    expect(input.selectionStart).toBe(6);
  });

  it('backspace over a separator removes the digit before it', async () => {
    const { user, input } = setup(ssn, '333-2');
    await user.type(input, '{Backspace}', {
      initialSelectionStart: 4,
      initialSelectionEnd: 4,
    });
    expect(input.value).toBe('332');
    expect(input.selectionStart).toBe(2);
  });

  it('drops a character that fits no slot and keeps the caret', async () => {
    const { user, input } = setup(ssn, '333-22');
    await user.type(input, 'a', {
      initialSelectionStart: 2,
      initialSelectionEnd: 2,
    });
    expect(input.value).toBe('333-22');
  });

  it('formats a phone with an extension and steps over a closing paren', async () => {
    const { user, input } = setup(formatPhoneInput);
    await user.type(input, '2125551234x12');
    expect(input.value).toBe('(212) 555-1234 x12');
    await user.clear(input);
    await user.type(input, '2125');
    expect(input.value).toBe('(212) 5');
    await user.type(input, '{Backspace}', {
      initialSelectionStart: 5,
      initialSelectionEnd: 5,
    });
    expect(input.value).toBe('(215)');
  });
});
