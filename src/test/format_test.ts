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

import {assert} from 'chai';
import stripAnsi from 'strip-ansi';

import {Config, ConfigFile, parseConfigFile} from '../config';
import {automaticResultTable, verticalTermResultTable} from '../format';
import {computeDifferences, ResultStats, summaryStats} from '../stats';
import {BenchmarkSpec} from '../types';

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
 * Given a config file object, generates fake measurement results, and returns
 * the terminal formatted result table that would be printed (minus color etc.
 * formatting).
 *
 * The fake measurement and byte size for each benchmark is based on its index
 * in the list of benchmarks (+10ms and +1KiB for each index).
 */
async function fakeResultTable(configFile: ConfigFile): Promise<string> {
  const config = await parseConfigFile(configFile);
  const results = [];
  for (let i = 0; i < config.benchmarks.length; i++) {
    const spec = config.benchmarks[i];
    const averageMillis = (i + 1) * 10;
    const bytes = (i + 1) * 1024;
    results.push(fakeResultStats(
        config, spec, averageMillis, bytes, userAgents.get(spec.browser.name)!
        ));
  }
  const resultsWithDifferences = computeDifferences(results);
  const resultTable = automaticResultTable(resultsWithDifferences).unfixed;
  return stripAnsi(verticalTermResultTable(resultTable));
}

function fakeResultStats(
    config: Config,
    {name, url, browser}: BenchmarkSpec,
    averageMillis: number,
    bytesSent: number,
    userAgent: string): ResultStats {
  const millis = [
    // Split the sample size in half to add +/- 5ms variance, just to make
    // things a little more interesting.
    ...new Array(Math.floor(config.sampleSize / 2)).fill(averageMillis - 5),
    ...new Array(Math.ceil(config.sampleSize / 2)).fill(averageMillis + 5),
  ];
  return {
    result: {
      name,
      queryString: url.kind === 'local' ? url.queryString : '',
      version: url.kind === 'local' && url.version !== undefined ?
          url.version.label :
          '',
      millis,
      bytesSent,
      browser,
      userAgent,
    },
    stats: summaryStats(millis),
  };
}

suite('format', () => {
  test('1 remote', async () => {
    const config: ConfigFile = {
      benchmarks: [
        {
          url: 'http://example.com',
          browser: {
            name: 'chrome',
          },
        },
      ],
    };

    const actual = await fakeResultTable(config);
    const expected = `
┌──────────────────┐
│         Avg time │
├──────────────────┤
│ 8.56ms - 11.44ms │
└──────────────────┘
    `;
    assert.equal(actual, expected.trim() + '\n');
  });

  test('2 remote, 2 browsers', async () => {
    const config: ConfigFile = {
      benchmarks: [
        {
          url: 'http://example.com',
          browser: {
            name: 'chrome',
          },
        },
        {
          url: 'http://example.com',
          browser: {
            name: 'firefox',
          },
        },
      ],
    };

    const actual = await fakeResultTable(config);
    const expected = `
┌───────────────┬──────────┬───────────────────┬──────────────────┬──────────────────┐
│ Browser       │ Bytes    │          Avg time │        vs chrome │       vs firefox │
├───────────────┼──────────┼───────────────────┼──────────────────┼──────────────────┤
│ chrome        │ 1.00 KiB │  8.56ms - 11.44ms │                  │           faster │
│ 75.0.3770.100 │          │                   │         -        │        42% - 58% │
│               │          │                   │                  │ 7.97ms - 12.03ms │
├───────────────┼──────────┼───────────────────┼──────────────────┼──────────────────┤
│ firefox       │ 2.00 KiB │ 18.56ms - 21.44ms │           slower │                  │
│ 60.0          │          │                   │       68% - 132% │         -        │
│               │          │                   │ 7.97ms - 12.03ms │                  │
└───────────────┴──────────┴───────────────────┴──────────────────┴──────────────────┘
    `;
    assert.equal(actual, expected.trim() + '\n');
  });
});
