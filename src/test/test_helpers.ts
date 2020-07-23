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

import {applyDefaults} from '../config';
import {ConfigFile, parseConfigFile} from '../configfile';
import {computeDifferences, ResultStatsWithDifferences, summaryStats} from '../stats';

/**
 * Absolute location on disk of our test data directory.
 */
export const testData =
    path.resolve(__dirname, '..', '..', 'src', 'test', 'data');

const userAgents = new Map([
  [
    'chrome',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36',
  ],
  [
    'firefox',
    'Mozilla/5.0 (X11; Linux x86_64; rv:60.0) Gecko/20100101 Firefox/60.0',
  ],
]);

/**
 * Given a config file object, generates fake measurement results, where the
 * measurement and byte size for each benchmark is based on its index in the
 * list of benchmarks (+10ms and +1KiB for each index).
 */
export async function fakeResults(configFile: ConfigFile):
    Promise<ResultStatsWithDifferences[]> {
  const config = applyDefaults(await parseConfigFile(configFile));
  const results = [];
  for (let i = 0; i < config.benchmarks.length; i++) {
    const {name, url, browser, measurement} = config.benchmarks[i];
    const averageMillis = (i + 1) * 10;
    const bytesSent = (i + 1) * 1024;
    const millis = [
      // Split the sample size in half to add +/- 5ms variance, just to make
      // things a little more interesting.
      ...new Array(Math.floor(config.sampleSize / 2)).fill(averageMillis - 5),
      ...new Array(Math.ceil(config.sampleSize / 2)).fill(averageMillis + 5),
    ];
    for (let measurementIndex = 0; measurementIndex < measurement.length;
         measurementIndex++) {
      results.push({
        stats: summaryStats(millis),
        result: {
          name,
          measurementIndex,
          queryString: url.kind === 'local' ? url.queryString : '',
          version: url.kind === 'local' && url.version !== undefined ?
              url.version.label :
              '',
          millis,
          bytesSent,
          browser,
          userAgent: userAgents.get(browser.name) || '',
        },
      });
    }
  }
  return computeDifferences(results);
}
