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

import * as path from 'path';

import commandLineUsage = require('command-line-usage');

import {optDefs, parseFlags} from './flags';
import {BenchmarkSpec} from './types';
import {makeConfig} from './config';
import {Server} from './server';
import {ResultStatsWithDifferences} from './stats';
import {prepareVersionDirectory, makeServerPlans} from './versions';
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

  const config = await makeConfig(opts);

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
