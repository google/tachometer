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

import {validBrowsers} from './browser';
import {BenchmarkSpec, ConfigFormat} from './types';
import {parsePackageVersions} from './versions';

const ignoreDirs = new Set([
  'node_modules',
  'common',
  'versions',
]);

interface Opts {
  root: string;
  name: string;
  implementation: string;
  variant: string;
  browser: string;
  'package-version': string[];
}

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

  const versions = parsePackageVersions(opts['package-version']);

  const specs: BenchmarkSpec[] = [];
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

  const variants = new Set(
      opts.variant.split(',').map((v) => v.trim()).filter((v) => v !== ''));

  for (const implementation of impls) {
    const implDir = path.join(opts.root, implementation);
    let benchmarks;
    if (opts.name === '*') {
      benchmarks = await listDirs(implDir);
      benchmarks = benchmarks.filter(
          (implDir) => !implDir.startsWith('.') && !ignoreDirs.has(implDir));
    } else {
      benchmarks = opts.name.split(',');
      const badNames = benchmarks.filter((dir) => ignoreDirs.has(dir));
      if (badNames.length > 0) {
        throw new Error(`Benchmarks cannot be named ${badNames.join(' or ')}`);
      }
    }
    for (const name of benchmarks) {
      const benchDir = path.join(implDir, name);
      if (!await fsExtra.pathExists(benchDir)) {
        continue;
      }
      let config: ConfigFormat|undefined;
      try {
        config = await fsExtra.readJson(path.join(benchDir, 'benchmarks.json'));
      } catch (e) {
        if (e.code !== 'ENOENT') {
          throw e;
        }
      }
      const implVersions = versions.get(implementation) ||
          [{label: 'default', dependencyOverrides: {}}];
      const partialSpec = {
        name,
        implementation,
      };
      if (config && config.variants && config.variants.length) {
        for (const variant of config.variants) {
          if (variant.name &&
              (variants.has('*') || variants.has(variant.name))) {
            for (const version of implVersions) {
              for (const browser of browsers) {
                specs.push({
                  ...partialSpec,
                  browser,
                  version,
                  variant: variant.name || '',
                  config: variant.config || {},
                });
              }
            }
          }
        }
      } else if (opts.variant === '*') {
        for (const version of implVersions) {
          for (const browser of browsers) {
            specs.push({
              ...partialSpec,
              browser,
              version,
              variant: '',
              config: {},
            });
          }
        }
      }
    }
  }

  specs.sort((a, b) => {
    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }
    if (a.variant !== b.variant) {
      return a.variant.localeCompare(b.variant);
    }
    if (a.implementation !== b.implementation) {
      return a.implementation.localeCompare(b.implementation);
    }
    if (a.version.label !== b.version.label) {
      return a.version.label.localeCompare(b.version.label);
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
  variant?: string;
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
      spec.implementation !== selector.implementation) {
    return false;
  }
  if (selector.variant !== undefined && spec.variant !== selector.variant) {
    return false;
  }
  if (selector.version !== undefined &&
      spec.version.label !== selector.version) {
    return false;
  }
  if (selector.browser !== undefined && spec.browser !== selector.browser) {
    return false;
  }
  return true;
}
