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

import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as url from 'url';

import {validBrowsers} from './browser';
import {Opts} from './cli';
import {BenchmarkSpec} from './types';
import {parsePackageVersions} from './versions';

const ignoreDirs = new Set([
  'node_modules',
  'common',
  'versions',
]);

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

  const remoteUrls = [];
  const localNames: {name: string, queryString: string}[] = [];
  let anyLocalNamesAreStar = false;
  // Benchmark names/URLs are the bare arguments not associated with a flag, so
  // they are found in _unknown.
  for (const benchmark of opts._unknown || []) {
    try {
      new url.URL(benchmark);
      remoteUrls.push(benchmark);
    } catch (e) {
      if (e.code === 'ERR_INVALID_URL') {
        const [name, queryString] = splitQueryString(benchmark);
        localNames.push({name, queryString});
        if (name === '*') {
          anyLocalNamesAreStar = true;
        }
      } else {
        throw e;
      }
    }
  }

  const specs: BenchmarkSpec[] = [];
  for (const url of remoteUrls) {
    for (const browser of browsers) {
      specs.push({
        url: {
          kind: 'remote',
          url,
        },
        measurement: 'fcp',
        browser,
        // TODO Find a shorter unambiguous name since these can make the result
        // table unwieldy, or do something smarter in the result table.
        name: url,
      });
    }
  }

  let impls;
  if (opts.implementation === '*') {
    impls = await listDirs(opts.root);
    impls = impls.filter((dir) => !dir.startsWith('.') && !ignoreDirs.has(dir));
  } else {
    impls = opts.implementation.split(',');
    const badNames = impls.filter((dir) => ignoreDirs.has(dir));
    if (badNames.length > 0) {
      throw new Error(
          `Implementations cannot be named ${badNames.join(' or ')}`);
    }
  }

  const versions = parsePackageVersions(opts['package-version']);

  for (const implementation of impls) {
    const implDir = path.join(opts.root, implementation);
    let benchmarks;
    if (anyLocalNamesAreStar === true) {
      benchmarks = await listDirs(implDir);
      benchmarks = benchmarks.filter(
          (implDir) => !implDir.startsWith('.') && !ignoreDirs.has(implDir));
    } else {
      const badNames = localNames.filter(({name}) => ignoreDirs.has(name));
      if (badNames.length > 0) {
        throw new Error(`Benchmarks cannot be named ${badNames.join(' or ')}`);
      }
    }
    for (const {name, queryString} of localNames) {
      const benchDir = path.join(implDir, name);
      if (!await fsExtra.pathExists(benchDir)) {
        continue;
      }
      const implVersions = versions.get(implementation) ||
          [{label: 'default', dependencyOverrides: {}}];
      const partialSpec = {
        name,
        measurement: opts.measure,
      };
      for (const version of implVersions) {
        for (const browser of browsers) {
          specs.push({
            ...partialSpec,
            browser,
            url: {
              kind: 'local',
              queryString,
              implementation,
              version,
            }
          });
        }
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
      if (a.url.implementation !== b.url.implementation) {
        return a.url.implementation.localeCompare(b.url.implementation);
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

async function listDirs(root: string): Promise<string[]> {
  const files = await fsExtra.readdir(root);
  const stats = await Promise.all(
      files.map((name) => fsExtra.stat(path.join(root, name))));
  return files.filter((_, idx) => stats[idx].isDirectory());
}

export interface SpecFilter {
  name?: string;
  implementation?: string;
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
  if (selector.implementation !== undefined &&
      (spec.url.kind !== 'local' ||
       spec.url.implementation !== selector.implementation)) {
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
