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

import ansi = require('ansi-escape-sequences');

import {Server} from './server';
import {Config} from './config';
import {specUrl} from './specs';
import {BenchmarkSpec} from './types';

/**
 * Let the user run benchmarks manually. This process will not exit until
 * the user sends a termination signal.
 */
export async function manualMode(
    config: Config, servers: Map<BenchmarkSpec, Server>) {
  if (config.savePath) {
    throw new Error(`Can't save results in manual mode`);
  }

  console.log('\nVisit these URLs in any browser:');
  const allServers = new Set<Server>([...servers.values()]);
  for (const spec of config.benchmarks) {
    console.log();
    if (spec.url.kind === 'local') {
      console.log(
          `${spec.name}${spec.url.queryString}` +
          (spec.url.version !== undefined ? ` [@${spec.url.version.label}]` :
                                            ''));
    }
    console.log(ansi.format(`[yellow]{${specUrl(spec, servers, config)}}`));
  }

  console.log(`\nResults will appear below:\n`);
  for (const server of [...allServers]) {
    (async function() {
      while (true) {
        const result = await server.nextResults();
        server.endSession();
        console.log(`${result.millis.toFixed(3)} ms`);
      }
    })();
  }
}
