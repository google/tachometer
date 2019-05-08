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

import {validBrowsers} from './browser';
import {Opts} from './cli';
import {BenchmarkSpec} from './types';
import {fileKind, parsePackageVersions} from './versions';

/**
 * Derive the set of benchmark specifications we should run according to the
 * given options, which may require checking the layout on disk of the
 * benchmarks/ directory.
 */
export async function specsFromOpts(opts: Opts): Promise<BenchmarkSpec[]> {
  const browsers = new Set(
      opts.browser.replace(/\s+/, '').split(',').filter((b) => b !== ''));
  if (browsers.size === 0) {
    throw new Error('At least one --browser must be specified');
  }
  for (const b of browsers) {
    if (validBrowsers.has(b) === false) {
      throw new Error(
          `Browser ${b} is not supported, ` +
          `only ${[...validBrowsers].join(', ')} are currently supported`);
    }
  }

  const specs: BenchmarkSpec[] = [];

  const versions = parsePackageVersions(opts['package-version']);
  if (versions.length === 0) {
    versions.push({label: 'default', dependencyOverrides: {}});
  }

  // Benchmark paths/URLs are the bare arguments not associated with a flag, so
  // they are found in _unknown.
  for (const argStr of opts._unknown || []) {
    const arg = parseBenchmarkArgument(argStr);

    if (arg.kind === 'remote') {
      for (const browser of browsers) {
        specs.push({
          name: arg.alias || arg.url,
          url: {
            kind: 'remote',
            url: arg.url,
          },
          browser,
          measurement: 'fcp',  // callback not supported
        });
      }

    } else {
      const serverRelativePath = path.relative(opts.root, arg.diskPath);
      // TODO Test on Windows.
      if (serverRelativePath.startsWith('..')) {
        throw new Error(
            'File or directory is not accessible from server root:' +
            arg.diskPath);
      }

      const kind = await fileKind(arg.diskPath);
      if (kind === undefined) {
        throw new Error(`No such file or directory: ${arg.diskPath}`);
      }

      // TODO Test on Windows.
      let urlPath = `/${serverRelativePath.replace(path.win32.sep, '/')}`;
      if (kind === 'dir') {
        if (await fileKind(path.join(arg.diskPath, 'index.html')) !== 'file') {
          throw new Error(
              `Directory did not contain an index.html: ${arg.diskPath}`);
        }
        // We need a trailing slash when serving a directory. Our static server
        // will serve index.html at both /foo and /foo/, without redirects. But
        // these two forms will have baseURIs that resolve relative URLs
        // differently, and we want the form that would work the same as
        // /foo/index.html.
        urlPath += '/';
      }

      for (const browser of browsers) {
        for (const version of versions) {
          specs.push({
            name: arg.alias || serverRelativePath.replace(path.win32.sep, '/'),
            browser,
            measurement: opts.measure,
            url: {
              kind: 'local',
              urlPath,
              queryString: arg.queryString,
              version,
            },
          });
        }
      }
    };
  }

  specs.sort((a, b) => {
    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }
    if (a.url.kind !== b.url.kind) {
      return a.url.kind.localeCompare(b.url.kind);
    }
    if (a.url.kind === 'remote' && b.url.kind === 'remote') {
      if (a.url.url !== b.url.url) {
        return a.url.url.localeCompare(b.url.url);
      }
    }
    if (a.url.kind === 'local' && b.url.kind === 'local') {
      if (a.url.urlPath !== b.url.urlPath) {
        return a.url.urlPath.localeCompare(b.url.urlPath);
      }
      if (a.url.version.label !== b.url.version.label) {
        return a.url.version.label.localeCompare(b.url.version.label);
      }
      if (a.url.queryString !== b.url.queryString) {
        return a.url.queryString.localeCompare(b.url.queryString);
      }
    }
    if (a.browser !== b.browser) {
      return a.browser.localeCompare(b.browser);
    }
    return 0;
  });

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

function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch (e) {
    return false;
  }
}
