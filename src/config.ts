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

import {fcpBrowsers} from './browser';
import {Config} from './config';
import {parseConfigFile, writeBackSchemaIfNeeded} from './configfile';
import * as defaults from './defaults';
import {Opts} from './flags';
import {CheckConfig, parseGithubCheckFlag} from './github';
import {specsFromOpts} from './specs';
import {Horizons} from './stats';
import {BenchmarkSpec} from './types';
import {fileKind} from './util';

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

export async function makeConfig(opts: Opts): Promise<Config> {
  // These options are only controlled by flags.
  const baseConfig = {
    mode: (opts.manual === true ? 'manual' : 'automatic') as
        ('manual' | 'automatic'),
    savePath: opts.save,
    githubCheck: opts['github-check'] ?
        parseGithubCheckFlag(opts['github-check']) :
        undefined,
    remoteAccessibleHost: opts['remote-accessible-host'],
  };

  let config: Config;
  if (opts.config) {
    if (opts.root !== undefined) {
      throw new Error('--root cannot be specified when using --config');
    }
    if (opts.browser !== undefined) {
      throw new Error('--browser cannot be specified when using --config');
    }
    if (opts['sample-size'] !== undefined) {
      throw new Error('--sample-size cannot be specified when using --config');
    }
    if (opts.timeout !== undefined) {
      throw new Error('--timeout cannot be specified when using --config');
    }
    if (opts.horizon !== undefined) {
      throw new Error('--horizon cannot be specified when using --config');
    }
    if (opts.measure !== undefined) {
      throw new Error('--measure cannot be specified when using --config');
    }
    if (opts['resolve-bare-modules'] !== undefined) {
      throw new Error(
          '--resolve-bare-modules cannot be specified when using --config');
    }
    if (opts['window-size'] !== undefined) {
      throw new Error('--window-size cannot be specified when using --config');
    }
    const rawConfigObj = await fsExtra.readJson(opts.config);
    const validatedConfigObj = await parseConfigFile(rawConfigObj);

    await writeBackSchemaIfNeeded(rawConfigObj, opts.config);

    config = {
      ...baseConfig,
      ...validatedConfigObj,
    };

  } else {
    config = {
      ...baseConfig,
      root: opts.root !== undefined ? opts.root : defaults.root,
      sampleSize: opts['sample-size'] !== undefined ? opts['sample-size'] :
                                                      defaults.sampleSize,
      timeout: opts.timeout !== undefined ? opts.timeout : defaults.timeout,
      horizons: parseHorizons(
          opts.horizon !== undefined ? opts.horizon.split(',') :
                                       defaults.horizons),
      benchmarks: await specsFromOpts(opts),
      resolveBareModules: opts['resolve-bare-modules'] !== undefined ?
          opts['resolve-bare-modules'] :
          true,
      forceCleanNpmInstall: opts['force-clean-npm-install'],
      csvFile: opts['csv-file'],
    };
  }

  if (config.sampleSize <= 1) {
    throw new Error('--sample-size must be > 1');
  }

  if (config.timeout < 0) {
    throw new Error('--timeout must be >= 0');
  }

  if (config.benchmarks.length === 0) {
    throw new Error('No benchmarks matched with the given flags');
  }

  for (const spec of config.benchmarks) {
    if (spec.measurement === 'fcp' && !fcpBrowsers.has(spec.browser.name)) {
      throw new Error(
          `Browser ${spec.browser.name} does not support the ` +
          `first contentful paint (FCP) measurement`);
    }
  }

  return config;
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

/** Parse horizon flags into signed horizon values. */
export function parseHorizons(strs: string[]): Horizons {
  const absolute = new Set<number>();
  const relative = new Set<number>();
  for (const str of strs) {
    if (!str.match(/^[-+]?(\d*\.)?\d+(ms|%)$/)) {
      throw new Error(`Invalid horizon ${str}`);
    }

    let num;
    let absOrRel;
    const isPercent = str.endsWith('%');
    if (isPercent === true) {
      num = Number(str.slice(0, -1)) / 100;
      absOrRel = relative;
    } else {
      // Otherwise ends with "ms".
      num = Number(str.slice(0, -2));  // Note that Number("+1") === 1
      absOrRel = absolute;
    }

    if (str.startsWith('+') || str.startsWith('-') || num === 0) {
      // If the sign was explicit (e.g. "+0.1", "-0.1") then we're only
      // interested in that signed horizon.
      absOrRel.add(num);
    } else {
      // Otherwise (e.g. "0.1") we're interested in the horizon as a
      // difference in either direction.
      absOrRel.add(-num);
      absOrRel.add(num);
    }
  }
  return {
    absolute: [...absolute].sort((a, b) => a - b),
    relative: [...relative].sort((a, b) => a - b),
  };
}
