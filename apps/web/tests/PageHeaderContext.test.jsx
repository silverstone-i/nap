/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PageHeaderProvider,
  usePageHeader,
} from '../src/shell/PageHeaderContext.jsx';

function Page({ title }) {
  usePageHeader({ title });
  return null;
}

afterEach(cleanup);

describe('usePageHeader', () => {
  it('sets the browser tab title and resets it on unmount', () => {
    const { rerender } = render(
      <PageHeaderProvider>
        <Page title="Portal Users" />
      </PageHeaderProvider>
    );
    expect(document.title).toBe('Portal Users · nap.');

    rerender(<PageHeaderProvider>{null}</PageHeaderProvider>);
    expect(document.title).toBe('nap.');
  });
});
