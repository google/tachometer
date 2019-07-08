/**
 * @license
 * Copyright (c) 2019 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

import {URL} from 'url';

/** Return whether the given string is a valid HTTP URL. */
export function isHttpUrl(str: string): boolean {
  try {
    const url = new URL(str);
    // Note an absolute Windows file path will parse as a URL (e.g.
    // 'C:\\foo\\bar' => {protocol: 'c:', pathname: '\\foo\\bar', ...})
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (e) {
    return false;
  }
}
