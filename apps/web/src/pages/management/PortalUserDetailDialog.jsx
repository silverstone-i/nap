/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DetailDialog } from './DetailDialog.jsx';
import { yesNo } from './yesNo.js';
import { MembershipsTable } from './LoginRecoveryDialogs.jsx';

/**
 * A portal user's detail (I0002-R018, I0008-R019): status, password,
 * lock, archived date, and memberships, with the actions that apply.
 * @param {{user: object, actions: Array<{label: string, onClick: () => void}>, describeError: (err: unknown) => string, onClose: () => void}} props
 *   `user` is a `GET /accounts/users` row.
 * @returns {JSX.Element}
 */
export function PortalUserDetailDialog({
  user,
  actions,
  describeError,
  onClose,
}) {
  return (
    <DetailDialog
      id="portal-user-detail-title"
      title={user.email}
      rows={[
        ['Status', user.status],
        ['Must change password', yesNo(user.mustChangePassword)],
        ['Locked', yesNo(user.locked)],
        [
          'Archived',
          user.deactivatedAt
            ? new Date(user.deactivatedAt).toLocaleString()
            : null,
        ],
      ]}
      actions={actions}
      onClose={onClose}
    >
      <MembershipsTable user={user} describeError={describeError} />
    </DetailDialog>
  );
}
