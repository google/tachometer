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

import {execFile, ExecFileOptions} from 'child_process';
import * as fsExtra from 'fs-extra';
import {URL} from 'url';
import {promisify} from 'util';

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

export async function fileKind(path: string): Promise<'file'|'dir'|undefined> {
  try {
    const stat = await fsExtra.stat(path);
    if (stat.isDirectory()) {
      return 'dir';
    }
    if (stat.isFile()) {
      return 'file';
    }
  } catch (e) {
    if (e.code === 'ENOENT') {
      return undefined;
    }
    throw e;
  }
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
export async function runNpm(
    args: string[], options?: ExecFileOptions): Promise<string|Buffer> {
  return promisify(execFile)(npmCmd, args, options).then(({stdout}) => stdout);
}
