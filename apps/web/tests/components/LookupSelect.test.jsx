/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/api/client.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiGet } from '../../src/api/client.js';
import { clearLookups } from '../../src/api/endpoints.js';
import { CountrySelect } from '../../src/components/CountrySelect.jsx';
import { CurrencySelect } from '../../src/components/CurrencySelect.jsx';

const countries = [
  { code: 'CA', alpha3: 'CAN', numericCode: '124', name: 'Canada' },
  { code: 'US', alpha3: 'USA', numericCode: '840', name: 'United States' },
];
const currencies = [
  { code: 'JPY', numericCode: '392', name: 'Yen', minorUnit: 0 },
  { code: 'USD', numericCode: '840', name: 'US Dollar', minorUnit: 2 },
];

beforeEach(() => {
  clearLookups();
  apiGet.mockReset();
  apiGet.mockImplementation(async path =>
    path.endsWith('/countries') ? countries : currencies
  );
});
afterEach(cleanup);

describe('lookup controls (M0004-R009)', () => {
  it('filters countries by name and returns the selected code', async () => {
    const onChange = vi.fn();
    render(<CountrySelect value={null} onChange={onChange} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Country'), 'unit');
    const options = await screen.findAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual(['United States (US)']);
    await user.click(options[0]);
    expect(onChange).toHaveBeenCalledWith('US');
  });

  it('filters currencies by code and shows the current value', async () => {
    const onChange = vi.fn();
    render(<CurrencySelect value="USD" onChange={onChange} />);
    await waitFor(() =>
      expect(screen.getByLabelText('Currency').value).toBe('US Dollar (USD)')
    );
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Currency'));
    await user.type(screen.getByLabelText('Currency'), 'jp');
    const options = await screen.findAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual(['Yen (JPY)']);
  });

  it('loads each list once per session', async () => {
    render(<CountrySelect value={null} onChange={() => {}} />);
    render(<CountrySelect value={null} onChange={() => {}} label="Other" />);
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
  });

  it('reports a failed load', async () => {
    apiGet.mockRejectedValue(new Error('down'));
    render(<CurrencySelect value={null} onChange={() => {}} />);
    expect(await screen.findByText('Could not load the list')).toBeTruthy();
  });
});
