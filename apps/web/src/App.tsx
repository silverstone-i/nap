/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Route, Routes } from 'react-router';
import {
  EntityInboxRedirect,
  EntityRoute,
  RootRedirect,
} from './shell/EntityRoute';
import { InboxPage } from './pages/InboxPage';
import { ProjectsListPage } from './pages/ProjectsListPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { InvoicesListPage } from './pages/InvoicesListPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path=":entityId" element={<EntityRoute />}>
        <Route index element={<EntityInboxRedirect />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="projects" element={<ProjectsListPage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="ap/invoices" element={<InvoicesListPage />} />
        <Route path="*" element={<EntityInboxRedirect />} />
      </Route>
    </Routes>
  );
}
