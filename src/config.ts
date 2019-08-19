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

import * as path from 'path';
import {CheckConfig} from './github';
import {Horizons} from './stats';
import {BenchmarkSpec} from './types';
import {fileKind} from './versions';

/**
 * Validated and fully specified configuration.
 */
export interface Config {
  root: string;
  sampleSize: number;
  timeout: number;
  benchmarks: BenchmarkSpec[];
  horizons: Horizons;
  mode: 'automatic'|'manual';
  savePath: string;
  githubCheck?: CheckConfig;
  resolveBareModules: boolean;
  remoteAccessibleHost: string;
  forceCleanNpmInstall: boolean;
  csvFile: string;
}

/**
 * Derives the URL that we'll use to benchmark using the given HTML file or
 * directory on disk, relative to the root directory we'll be serving. Throws if
 * it's a file that doesn't exist, or a directory without an index.html.
 */
export async function urlFromLocalPath(
    rootDir: string, diskPath: string): Promise<string> {
  const serverRelativePath = path.relative(rootDir, diskPath);
  // TODO Test on Windows.
  if (serverRelativePath.startsWith('..')) {
    throw new Error(
        'File or directory is not accessible from server root: ' + diskPath);
  }

  const kind = await fileKind(diskPath);
  if (kind === undefined) {
    throw new Error(`No such file or directory: ${diskPath}`);
  }

  // TODO Test on Windows.
  let urlPath = `/${serverRelativePath.replace(path.win32.sep, '/')}`;
  if (kind === 'dir') {
    if (await fileKind(path.join(diskPath, 'index.html')) !== 'file') {
      throw new Error(`Directory did not contain an index.html: ${diskPath}`);
    }
    // We need a trailing slash when serving a directory. Our static server
    // will serve index.html at both /foo and /foo/, without redirects. But
    // these two forms will have baseURIs that resolve relative URLs
    // differently, and we want the form that would work the same as
    // /foo/index.html.
    urlPath += '/';
  }
  return urlPath;
}
