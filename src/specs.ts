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
import {URL} from 'url';

import {parseAndValidateBrowser} from './browser';
import {Opts} from './cli';
import {defaultBrowser, defaultMeasurement, defaultRoot, urlFromLocalPath} from './config';
import {BenchmarkSpec, LocalUrl, PackageVersion, RemoteUrl} from './types';
import {parsePackageVersions} from './versions';

/**
 * Derive the set of benchmark specifications we should run according to the
 * given options, which may require checking the layout on disk of the
 * benchmarks/ directory.
 */
export async function specsFromOpts(opts: Opts): Promise<BenchmarkSpec[]> {
  const browsers = new Set((opts.browser || defaultBrowser)
                               .replace(/\s+/, '')
                               .split(',')
                               .filter((b) => b !== ''));
  if (browsers.size === 0) {
    throw new Error('At least one --browser must be specified');
  }
  for (const b of browsers) {
    parseAndValidateBrowser(b);
  }

  const specs: BenchmarkSpec[] = [];

  const versions: Array<PackageVersion|undefined> =
      parsePackageVersions(opts['package-version']);
  if (versions.length === 0) {
    versions.push(undefined);
  }

  // Benchmark paths/URLs are the bare arguments not associated with a flag, so
  // they are found in _unknown.
  for (const argStr of opts._unknown || []) {
    const arg = parseBenchmarkArgument(argStr);

    if (arg.kind === 'remote') {
      const url: RemoteUrl = {
        kind: 'remote',
        url: arg.url,
      };
      const measurement =
          opts.measure !== undefined ? opts.measure : defaultMeasurement(url);
      for (const browser of browsers) {
        specs.push({
          name: arg.alias || arg.url,
          browser,
          measurement,
          url,
        });
      }

    } else {
      const root = opts.root || defaultRoot;
      const urlPath = await urlFromLocalPath(root, arg.diskPath);
      let name = arg.alias;
      if (name === undefined) {
        const serverRelativePath = path.relative(root, arg.diskPath);
        name = serverRelativePath.replace(path.win32.sep, '/');
      }
      for (const browser of browsers) {
        for (const version of versions) {
          const url: LocalUrl = {
            kind: 'local',
            urlPath,
            queryString: arg.queryString,
            version,
          };
          const measurement = opts.measure !== undefined ?
              opts.measure :
              defaultMeasurement(url);
          specs.push({
            name,
            browser,
            measurement,
            url,
          });
        }
      }
    }
  }

  return specs;
}

function parseBenchmarkArgument(str: string):
    {kind: 'remote', url: string, alias?: string}|
    {kind: 'local', diskPath: string, queryString: string, alias?: string} {
  if (isUrl(str)) {
    // http://example.com
    return {
      kind: 'remote',
      url: str,
    };
  }

  if (str.includes('=')) {
    const eq = str.indexOf('=');
    const maybeUrl = str.substring(eq + 1);
    if (isUrl(maybeUrl)) {
      // foo=http://example.com
      return {
        kind: 'remote',
        url: maybeUrl,
        alias: str.substring(0, eq),
      };
    }
  }

  let queryString = '';
  if (str.includes('?')) {
    // a/b.html?a=b
    // foo=a/b.html?a=b
    const q = str.indexOf('?');
    queryString = str.substring(q);
    str = str.substring(0, q);
  }

  let alias = undefined;
  if (str.includes('=')) {
    // foo=a/b.html?a=b
    // foo=a/b.html
    const eq = str.indexOf('=');
    alias = str.substring(0, eq);
    str = str.substring(eq + 1);
  }

  // a/b.html
  // a/b.html?a=b
  // foo=a/b.html
  // foo=a/b.html?a=b
  return {
    kind: 'local',
    alias,
    diskPath: str,
    queryString: queryString,
  };
}

export function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch (e) {
    return false;
  }
}
