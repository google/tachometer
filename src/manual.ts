/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import ansi from 'ansi-escape-sequences';
import {Server} from './server.js';
import {Config} from './config.js';
import {specUrl} from './specs.js';
import {BenchmarkSpec} from './types.js';

/**
 * Let the user run benchmarks manually. This process will not exit until
 * the user sends a termination signal.
 */
export async function manualMode(
  config: Config,
  servers: Map<BenchmarkSpec, Server>
) {
  if (
    config.csvFileStats ||
    config.csvFileRaw ||
    config.jsonFile ||
    config.legacyJsonFile
  ) {
    throw new Error(`Can't save results in manual mode`);
  }

  console.log('\nVisit these URLs in any browser:');
  const allServers = new Set<Server>([...servers.values()]);
  for (const spec of config.benchmarks) {
    console.log();
    if (spec.url.kind === 'local') {
      console.log(
        `${spec.name}${spec.url.queryString}` +
          (spec.url.version !== undefined
            ? ` [@${spec.url.version.label}]`
            : '')
      );
    }
    console.log(ansi.format(`[yellow]{${specUrl(spec, servers, config)}}`));
  }

  for (const server of [...allServers]) {
    (async function () {
      while (true) {
        const result = await server.nextResults();
        server.endSession();
        console.log(`${result.millis.toFixed(3)} ms`);
      }
    })();
  }
}
