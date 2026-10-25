/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import { getFileLink } from '../api/endpoints.js';

/**
 * The URL of a default profile image nap ships (M0006-03-R004).
 * @param {string} name
 * @returns {string}
 */
export function defaultImageUrl(name) {
  return `/avatars/${name}.gif`;
}

/**
 * The URL to show for a member's profile image (M0006-03-R007): a default
 * image's bundled file, or a signed link to an uploaded one. `null` with no
 * image, while a link loads, or when it fails, so the caller shows initials.
 * @param {{defaultImage: string}|{fileId: string}|null} image
 * @returns {string|null}
 */
export function useProfileImage(image) {
  const fileId = image?.fileId ?? null;
  const [link, setLink] = useState(null);
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
  if (image?.defaultImage) return defaultImageUrl(image.defaultImage);
  return fileId && link?.fileId === fileId ? link.url : null;
}
