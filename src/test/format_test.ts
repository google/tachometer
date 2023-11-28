/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {assert} from 'chai';
import {suite, suiteSetup, suiteTeardown, test} from 'mocha';
import * as path from 'path';
import stripAnsi from 'strip-ansi';

import {ConfigFile} from '../configfile.js';
import {
  automaticResultTable,
  horizontalTermResultTable,
  verticalTermResultTable,
  partitionResultTableByMeasurement,
} from '../format.js';
import {fakeResults, testData} from './test_helpers.js';

/**
 * Given a config file object, generates fake measurement results, and returns
 * the terminal formatted result table that would be printed (minus color etc.
 * formatting).
 */
async function fakeResultTable(configFile: ConfigFile): Promise<string> {
  const results = await fakeResults(configFile);
  const {fixed, unfixed} = automaticResultTable(results);
  return stripAnsi(
    horizontalTermResultTable(fixed) + '\n' + verticalTermResultTable(unfixed)
  );
}

/**
 * Given a config file object, generates fake measurement results, and returns
 * the partitioned formatted result tables that would be printed (minus color
 * etc. formatting).
 */
async function fakePartitionedResultTablesByMeasurement(
  configFile: ConfigFile
): Promise<string> {
  const results = await fakeResults(configFile);
  return partitionResultTableByMeasurement(results)
    .map((result) => {
      return stripAnsi(verticalTermResultTable(result.unfixed));
    })
    .join('\n');
}

suite('format', () => {
  let prevCwd: string;
  suiteSetup(() => {
    prevCwd = process.cwd();
    process.chdir(path.join(testData, 'mylib'));
  });

  suiteTeardown(() => {
    process.chdir(prevCwd);
  });

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
┌─────────────┬────────────────────┐
│   Benchmark │ http://example.com │
├─────────────┼────────────────────┤
│     Version │ <none>             │
├─────────────┼────────────────────┤
│     Browser │ chrome             │
│             │ 75.0.3770.100      │
├─────────────┼────────────────────┤
│ Sample size │ 50                 │
├─────────────┼────────────────────┤
│       Bytes │ 1.00 KiB           │
└─────────────┴────────────────────┘

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
┌─────────────┬────────────────────┐
│   Benchmark │ http://example.com │
├─────────────┼────────────────────┤
│     Version │ <none>             │
├─────────────┼────────────────────┤
│ Sample size │ 50                 │
└─────────────┴────────────────────┘

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

  test('remote and local, with query params, without labels', async () => {
    const config: ConfigFile = {
      benchmarks: [
        {
          url: 'http://example.com?p=bar',
          browser: {
            name: 'chrome',
          },
        },
        {
          url: 'mybench/index.html?p=bar',
          browser: {
            name: 'chrome',
          },
        },
      ],
    };

    const actual = await fakeResultTable(config);
    const expected = `
┌─────────────┬───────────────┐
│     Version │ <none>        │
├─────────────┼───────────────┤
│     Browser │ chrome        │
│             │ 75.0.3770.100 │
├─────────────┼───────────────┤
│ Sample size │ 50            │
└─────────────┴───────────────┘

┌───────────────────────────┬──────────┬───────────────────┬─────────────────────────────┬──────────────────────────────┐
│ Benchmark                 │ Bytes    │          Avg time │ vs http://example.com?p=bar │ vs /mybench/index.html?p=bar │
├───────────────────────────┼──────────┼───────────────────┼─────────────────────────────┼──────────────────────────────┤
│ http://example.com?p=bar  │ 1.00 KiB │  8.56ms - 11.44ms │                             │                       faster │
│                           │          │                   │                    -        │                    42% - 58% │
│                           │          │                   │                             │             7.97ms - 12.03ms │
├───────────────────────────┼──────────┼───────────────────┼─────────────────────────────┼──────────────────────────────┤
│ /mybench/index.html?p=bar │ 2.00 KiB │ 18.56ms - 21.44ms │                      slower │                              │
│                           │          │                   │                  68% - 132% │                     -        │
│                           │          │                   │            7.97ms - 12.03ms │                              │
└───────────────────────────┴──────────┴───────────────────┴─────────────────────────────┴──────────────────────────────┘
    `;
    assert.equal(actual, expected.trim() + '\n');
  });

  test('remote and local, with query params, with labels', async () => {
    const config: ConfigFile = {
      benchmarks: [
        {
          name: 'foo',
          url: 'http://example.com?p=bar',
          browser: {
            name: 'chrome',
          },
        },
        {
          name: 'bar',
          url: 'mybench/index.html?p=bar',
          browser: {
            name: 'chrome',
          },
        },
      ],
    };

    const actual = await fakeResultTable(config);
    const expected = `
┌─────────────┬───────────────┐
│     Version │ <none>        │
├─────────────┼───────────────┤
│     Browser │ chrome        │
│             │ 75.0.3770.100 │
├─────────────┼───────────────┤
│ Sample size │ 50            │
└─────────────┴───────────────┘

┌───────────┬──────────┬───────────────────┬──────────────────┬──────────────────┐
│ Benchmark │ Bytes    │          Avg time │           vs foo │           vs bar │
├───────────┼──────────┼───────────────────┼──────────────────┼──────────────────┤
│ foo       │ 1.00 KiB │  8.56ms - 11.44ms │                  │           faster │
│           │          │                   │         -        │        42% - 58% │
│           │          │                   │                  │ 7.97ms - 12.03ms │
├───────────┼──────────┼───────────────────┼──────────────────┼──────────────────┤
│ bar       │ 2.00 KiB │ 18.56ms - 21.44ms │           slower │                  │
│           │          │                   │       68% - 132% │         -        │
│           │          │                   │ 7.97ms - 12.03ms │                  │
└───────────┴──────────┴───────────────────┴──────────────────┴──────────────────┘
    `;
    assert.equal(actual, expected.trim() + '\n');
  });

  test('multiple measurements, partition: "none"', async () => {
    const config: ConfigFile = {
      benchmarks: [
        {
          name: 'foo',
          url: 'http://foo.com',
          measurement: [
            {name: 'render', mode: 'performance', entryName: 'render'},
            {name: 'update', mode: 'performance', entryName: 'update'},
          ],
        },
        {
          name: 'bar',
          url: 'http://bar.com',
          measurement: [
            {name: 'render', mode: 'performance', entryName: 'render'},
            {name: 'update', mode: 'performance', entryName: 'update'},
          ],
        },
      ],
    };

    const actual = await fakeResultTable(config);
    const expected = `
┌─────────────┬───────────────┐
│     Version │ <none>        │
├─────────────┼───────────────┤
│     Browser │ chrome        │
│             │ 75.0.3770.100 │
├─────────────┼───────────────┤
│ Sample size │ 50            │
└─────────────┴───────────────┘

┌──────────────┬──────────┬───────────────────┬───────────────────┬───────────────────┬───────────────────┬───────────────────┐
│ Benchmark    │ Bytes    │          Avg time │   vs foo [render] │   vs foo [update] │   vs bar [render] │   vs bar [update] │
├──────────────┼──────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────┤
│ foo [render] │ 1.00 KiB │  8.56ms - 11.44ms │                   │            unsure │            faster │            faster │
│              │          │                   │          -        │       -20% - +20% │         42% - 58% │         42% - 58% │
│              │          │                   │                   │ -2.03ms - +2.03ms │  7.97ms - 12.03ms │  7.97ms - 12.03ms │
├──────────────┼──────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────┤
│ foo [update] │ 1.00 KiB │  8.56ms - 11.44ms │            unsure │                   │            faster │            faster │
│              │          │                   │       -20% - +20% │          -        │         42% - 58% │         42% - 58% │
│              │          │                   │ -2.03ms - +2.03ms │                   │  7.97ms - 12.03ms │  7.97ms - 12.03ms │
├──────────────┼──────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────┤
│ bar [render] │ 2.00 KiB │ 18.56ms - 21.44ms │            slower │            slower │                   │            unsure │
│              │          │                   │        68% - 132% │        68% - 132% │          -        │       -10% - +10% │
│              │          │                   │  7.97ms - 12.03ms │  7.97ms - 12.03ms │                   │ -2.03ms - +2.03ms │
├──────────────┼──────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────┤
│ bar [update] │ 2.00 KiB │ 18.56ms - 21.44ms │            slower │            slower │            unsure │                   │
│              │          │                   │        68% - 132% │        68% - 132% │       -10% - +10% │          -        │
│              │          │                   │  7.97ms - 12.03ms │  7.97ms - 12.03ms │ -2.03ms - +2.03ms │                   │
└──────────────┴──────────┴───────────────────┴───────────────────┴───────────────────┴───────────────────┴───────────────────┘
    `;
    assert.equal(actual, expected.trim() + '\n');
  });

  test('multiple measurements, partition: "measurement"', async () => {
    const config: ConfigFile = {
      benchmarks: [
        {
          name: 'foo',
          url: 'http://foo.com',
          measurement: [
            {name: 'render', mode: 'performance', entryName: 'render'},
            {name: 'update', mode: 'performance', entryName: 'update'},
          ],
        },
        {
          name: 'bar',
          url: 'http://bar.com',
          measurement: [
            {name: 'render', mode: 'performance', entryName: 'render'},
            {name: 'update', mode: 'performance', entryName: 'update'},
          ],
        },
      ],
    };

    const actual = await fakePartitionedResultTablesByMeasurement(config);
    const expected = `
┌──────────────┬──────────┬───────────────────┬──────────────────┬──────────────────┐
│ Benchmark    │ Bytes    │          Avg time │  vs foo [render] │  vs bar [render] │
├──────────────┼──────────┼───────────────────┼──────────────────┼──────────────────┤
│ foo [render] │ 1.00 KiB │  8.56ms - 11.44ms │                  │           faster │
│              │          │                   │         -        │        42% - 58% │
│              │          │                   │                  │ 7.97ms - 12.03ms │
├──────────────┼──────────┼───────────────────┼──────────────────┼──────────────────┤
│ bar [render] │ 2.00 KiB │ 18.56ms - 21.44ms │           slower │                  │
│              │          │                   │       68% - 132% │         -        │
│              │          │                   │ 7.97ms - 12.03ms │                  │
└──────────────┴──────────┴───────────────────┴──────────────────┴──────────────────┘

┌──────────────┬──────────┬───────────────────┬──────────────────┬──────────────────┐
│ Benchmark    │ Bytes    │          Avg time │  vs foo [update] │  vs bar [update] │
├──────────────┼──────────┼───────────────────┼──────────────────┼──────────────────┤
│ foo [update] │ 1.00 KiB │  8.56ms - 11.44ms │                  │           faster │
│              │          │                   │         -        │        42% - 58% │
│              │          │                   │                  │ 7.97ms - 12.03ms │
├──────────────┼──────────┼───────────────────┼──────────────────┼──────────────────┤
│ bar [update] │ 2.00 KiB │ 18.56ms - 21.44ms │           slower │                  │
│              │          │                   │       68% - 132% │         -        │
│              │          │                   │ 7.97ms - 12.03ms │                  │
└──────────────┴──────────┴───────────────────┴──────────────────┴──────────────────┘
    `;
    assert.equal(actual, expected.trim() + '\n');
  });
});
