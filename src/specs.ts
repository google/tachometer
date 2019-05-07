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
import * as url from 'url';

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
          `Browser ${b} is not yet supported, ` +
          `only ${[...validBrowsers].join(', ')} are currently supported`);
    }
  }

  const specs: BenchmarkSpec[] = [];

  const addRemote = (url: string) => {
    for (const browser of browsers) {
      specs.push({
        name: url,  // TODO Support aliases.
        url: {
          kind: 'remote',
          url,
        },
        browser,
        measurement: 'fcp',  // callback not supported
      });
    }
  };

  const versions = parsePackageVersions(opts['package-version']);
  if (versions.length === 0) {
    versions.push({label: 'default', dependencyOverrides: {}});
  }

  const addLocal = async (localPathAndQueryString: string) => {
    const [localPath, queryString] = splitQueryString(localPathAndQueryString);

    const serverRelativePath = path.relative(opts.root, localPath);
    // TODO Test on Windows.
    if (serverRelativePath.startsWith('..')) {
      throw new Error(
          `File or directory is not accessible from server root: ${localPath}`);
    }

    const kind = await fileKind(localPath);
    if (kind === undefined) {
      throw new Error(`No such file or directory: ${localPath}`);
    }

    // TODO Test on Windows.
    let urlPath = `/${serverRelativePath.replace(path.win32.sep, '/')}`;
    if (kind === 'dir') {
      if (await fileKind(path.join(localPath, 'index.html')) !== 'file') {
        throw new Error(
            `Directory did not contain an index.html: ${localPath}`);
      }
      // We need a trailing slash when serving a directory. Our static server
      // will serve index.html at both /foo and /foo/, without redirects. But
      // these two forms will have baseURIs that resolve relative URLs
      // differently, and we want the form that would work the same as
      // /foo/index.html.
      urlPath += '/';
    }
    const name = localPath;  // TODO Support aliases.

    for (const browser of browsers) {
      for (const version of versions) {
        specs.push({
          name,
          browser,
          measurement: opts.measure,
          url: {
            kind: 'local',
            urlPath,
            queryString,
            version,
          },
        });
      }
    }
  };

  // Benchmark names/URLs are the bare arguments not associated with a flag, so
  // they are found in _unknown.
  for (const benchmark of opts._unknown || []) {
    try {
      new url.URL(benchmark);
      addRemote(benchmark);
    } catch (e) {
      if (e.code === 'ERR_INVALID_URL') {
        await addLocal(benchmark);
      } else {
        throw e;
      }
    }
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

export interface SpecFilter {
  name?: string;
  urlPath?: string;
  queryString?: string;
  version?: string;
  browser?: string;
}

/**
 * Return whether the given benchmark spec matches the given filter
 * configuration.
 */
export function specMatchesFilter(
    spec: BenchmarkSpec, selector: SpecFilter): boolean {
  if (selector.name !== undefined && spec.name !== selector.name) {
    return false;
  }
  if (selector.urlPath !== undefined &&
      (spec.url.kind !== 'local' || spec.url.urlPath !== selector.urlPath)) {
    return false;
  }
  if (selector.queryString !== undefined &&
      (spec.url.kind !== 'local' ||
       spec.url.queryString !== selector.queryString)) {
    return false;
  }
  if (selector.version !== undefined &&
      (spec.url.kind !== 'local' ||
       spec.url.version.label !== selector.version)) {
    return false;
  }
  if (selector.browser !== undefined && spec.browser !== selector.browser) {
    return false;
  }
  return true;
}

function splitQueryString(path: string): [string, string] {
  const q = path.indexOf('?');
  return q === -1 ? [path, ''] : [path.substring(0, q), path.substring(q)];
}
