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

require('source-map-support').install();

import * as fsExtra from 'fs-extra';
import * as path from 'path';

import commandLineUsage = require('command-line-usage');

import {optDefs, parseFlags} from './flags';
import {fcpBrowsers} from './browser';
import {BenchmarkSpec} from './types';
import {Server} from './server';
import {ResultStatsWithDifferences} from './stats';
import {specsFromOpts} from './specs';
import {prepareVersionDirectory, makeServerPlans} from './versions';
import {Config, parseHorizons} from './config';
import * as defaults from './defaults';
import {parseConfigFile, writeBackSchemaIfNeeded} from './configfile';
import * as github from './github';
import {manualMode} from './manual';
import {automaticMode} from './automatic';

const getVersion = (): string =>
    require(path.join(__dirname, '..', 'package.json')).version;

export async function main(argv: string[]):
    Promise<Array<ResultStatsWithDifferences>|undefined> {
  const opts = parseFlags(argv);

  if (opts.help) {
    console.log(commandLineUsage([
      {
        header: 'tach',
        content: `v${getVersion()}\nhttps://github.com/PolymerLabs/tachometer`,
      },
      {
        header: 'Usage',
        content: `
Run a benchmark from a local file:
$ tach foo.html

Compare a benchmark with different URL parameters:
$ tach foo.html?i=1 foo.html?i=2

Benchmark index.html in a directory:
$ tach foo/bar

Benchmark a remote URL's First Contentful Paint time:
$ tach http://example.com
`,
      },
      {
        header: 'Options',
        optionList: optDefs,
      },
    ]));
    return;
  }

  if (opts.version) {
    console.log(getVersion());
    return;
  }

  // These options are only controlled by flags.
  const baseConfig = {
    mode: (opts.manual === true ? 'manual' : 'automatic') as
        ('manual' | 'automatic'),
    savePath: opts.save,
    githubCheck: opts['github-check'] ?
        github.parseCheckFlag(opts['github-check']) :
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

  const plans = await makeServerPlans(
      config.root, opts['npm-install-dir'], config.benchmarks);

  const servers = new Map<BenchmarkSpec, Server>();
  const promises = [];
  for (const {npmInstalls, mountPoints, specs} of plans) {
    promises.push(...npmInstalls.map(
        (install) => prepareVersionDirectory(
            install,
            config.forceCleanNpmInstall,
            )));
    promises.push((async () => {
      const server = await Server.start({
        host: opts.host,
        ports: opts.port,
        root: config.root,
        mountPoints,
        resolveBareModules: config.resolveBareModules,
      });
      for (const spec of specs) {
        servers.set(spec, server);
      }
    })());
  }
  await Promise.all(promises);

  if (config.mode === 'manual') {
    await manualMode(config, servers);
  } else {
    try {
      return await automaticMode(config, servers);
    } finally {
      const allServers = new Set<Server>([...servers.values()]);
      await Promise.all([...allServers].map((server) => server.close()));
    }
  }
}
