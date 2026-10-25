/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import { getFileLink } from '../api/endpoints.js';

/**
 * The tenant logo, loaded by a signed link (M0006-02-R010, R014). With no
 * logo, or when the link or the image fails, it renders nothing, so the
 * tenant name beside it stands alone and the page still loads.
 * @param {{fileId: string|null, height?: number, alt?: string}} props
 * @returns {JSX.Element|null}
 */
export function TenantLogo({ fileId, height = 28, alt = '' }) {
  const [link, setLink] = useState(null);
  const [failed, setFailed] = useState(null);
  useEffect(() => {
    if (!fileId) return undefined;
    let live = true;
    getFileLink(fileId)
      .then(({ url }) => live && setLink({ fileId, url }))
      .catch(() => live && setLink(null));
    return () => {
      live = false;
    };
  }, [fileId]);
  if (!fileId || link?.fileId !== fileId || failed === link.url) return null;
  return (
    <Box
      component="img"
      src={link.url}
      alt={alt}
      onError={() => setFailed(link.url)}
      sx={{ height, maxWidth: height * 4, objectFit: 'contain' }}
    />
  );
}
