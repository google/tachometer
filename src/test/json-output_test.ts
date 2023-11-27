/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {assert} from 'chai';
import {suite, test} from 'mocha';

import {ConfigFile} from '../configfile.js';
import {jsonOutput, JsonOutputFile} from '../json-output.js';
import {fakeResults} from './test_helpers.js';

/**
 * We include the full precision statistics in the JSON output, but it's silly
 * to check them in this test to high precision. This function walks the JSON
 * output object (or any object) and reduces the precision of any number it
 * finds by rounding to the given number of decimal places.
 */
function roundPlacesAll(val: unknown, places: number): unknown {
  if (typeof val === 'number') {
    val = roundPlaces(val, places);
  } else if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      val[i] = roundPlacesAll(val[i], places);
    }
  } else if (typeof val === 'object' && val !== null && val !== undefined) {
    const obj = val as {[key: string]: unknown};
    for (const p of Object.getOwnPropertyNames(obj)) {
      obj[p] = roundPlacesAll(obj[p], places);
    }
  }
  return val;
}

function roundPlaces(num: number, places: number): number {
  return Math.round(num * 10 ** places) / 10 ** places;
}

suite('jsonOutput', () => {
  test('2x2 matrix', async () => {
    const config: ConfigFile = {
      benchmarks: [
        {
          name: 'foo',
          url: 'http://example.com?foo',
        },
        {
          name: 'bar',
          url: 'http://example.com?bar',
        },
      ],
    };
    const results = await fakeResults(config);
    const actual = jsonOutput(results);
    const expected: JsonOutputFile = {
      benchmarks: [
        {
          name: 'foo',
          bytesSent: 1024,
          version: undefined,
          measurement: {
            name: 'fcp',
            mode: 'performance',
            entryName: 'first-contentful-paint',
          },
          browser: {
            name: 'chrome',
            headless: false,
            windowSize: {width: 1024, height: 768},
            userAgent:
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36',
          },
          samples: [...new Array(25).fill(5), ...new Array(25).fill(15)],
          mean: {
            low: 8.56459,
            high: 11.43541,
          },
          differences: [
            null,
            {
              absolute: {
                low: -12.02998,
                high: -7.97002,
              },
              percentChange: {
                low: -58.02419,
                high: -41.97581,
              },
            },
          ],
        },
        {
          name: 'bar',
          bytesSent: 2048,
          version: undefined,
          measurement: {
            name: 'fcp',
            mode: 'performance',
            entryName: 'first-contentful-paint',
          },
          browser: {
            name: 'chrome',
            headless: false,
            windowSize: {width: 1024, height: 768},
            userAgent:
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36',
          },
          samples: [...new Array(25).fill(15), ...new Array(25).fill(25)],
          mean: {
            low: 18.56459,
            high: 21.43541,
          },
          differences: [
            {
              absolute: {
                low: 7.97002,
                high: 12.02998,
              },
              percentChange: {
                low: 67.90324,
                high: 132.09676,
              },
            },
            null,
          ],
        },
      ],
    };
    assert.deepEqual(roundPlacesAll(actual, 5), expected);
  });

  test('2x2 matrix with multiple measurements', async () => {
    const config: ConfigFile = {
      benchmarks: [
        {
          name: 'foo',
          url: 'http://example.com?foo',
          measurement: [
            {name: 'Metric 1', mode: 'performance', entryName: 'metric1'},
            {name: 'Metric 2', mode: 'performance', entryName: 'metric2'},
          ],
        },
        {
          name: 'bar',
          url: 'http://example.com?bar',
          measurement: [
            {name: 'Metric 1', mode: 'performance', entryName: 'metric1'},
            {name: 'Metric 2', mode: 'performance', entryName: 'metric2'},
          ],
        },
      ],
    };
    const results = await fakeResults(config);
    const actual = jsonOutput(results);
    const expected: JsonOutputFile = {
      benchmarks: [
        {
          name: 'foo [Metric 1]',
          bytesSent: 1024,
          version: undefined,
          measurement: {
            name: 'Metric 1',
            mode: 'performance',
            entryName: 'metric1',
          },
          browser: {
            name: 'chrome',
            headless: false,
            windowSize: {width: 1024, height: 768},
            userAgent:
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36',
          },
          samples: [...new Array(25).fill(5), ...new Array(25).fill(15)],
          mean: {low: 8.56459, high: 11.43541},
          differences: [
            null,
            {
              absolute: {high: 2.02998, low: -2.02998},
              percentChange: {high: 20.29978, low: -20.29978},
            },
            {
              absolute: {low: -12.02998, high: -7.97002},
              percentChange: {low: -58.02419, high: -41.97581},
            },
            {
              absolute: {high: -7.97002, low: -12.02998},
              percentChange: {high: -41.97581, low: -58.02419},
            },
          ],
        },
        {
          name: 'foo [Metric 2]',
          bytesSent: 1024,
          version: undefined,
          measurement: {
            name: 'Metric 2',
            mode: 'performance',
            entryName: 'metric2',
          },
          browser: {
            name: 'chrome',
            headless: false,
            windowSize: {width: 1024, height: 768},
            userAgent:
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36',
          },
          samples: [...new Array(25).fill(5), ...new Array(25).fill(15)],
          mean: {high: 11.43541, low: 8.56459},
          differences: [
            {
              absolute: {high: 2.02998, low: -2.02998},
              percentChange: {high: 20.29978, low: -20.29978},
            },
            null,
            {
              absolute: {high: -7.97002, low: -12.02998},
              percentChange: {high: -41.97581, low: -58.02419},
            },
            {
              absolute: {high: -7.97002, low: -12.02998},
              percentChange: {high: -41.97581, low: -58.02419},
            },
          ],
        },
        {
          name: 'bar [Metric 1]',
          bytesSent: 2048,
          version: undefined,
          measurement: {
            name: 'Metric 1',
            mode: 'performance',
            entryName: 'metric1',
          },
          browser: {
            name: 'chrome',
            headless: false,
            windowSize: {width: 1024, height: 768},
            userAgent:
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36',
          },
          samples: [...new Array(25).fill(15), ...new Array(25).fill(25)],
          mean: {low: 18.56459, high: 21.43541},
          differences: [
            {
              absolute: {low: 7.97002, high: 12.02998},
              percentChange: {low: 67.90324, high: 132.09676},
            },
            {
              absolute: {high: 12.02998, low: 7.97002},
              percentChange: {high: 132.09676, low: 67.90324},
            },
            null,
            {
              absolute: {high: 2.02998, low: -2.02998},
              percentChange: {high: 10.14989, low: -10.14989},
            },
          ],
        },
        {
          name: 'bar [Metric 2]',
          bytesSent: 2048,
          version: undefined,
          measurement: {
            name: 'Metric 2',
            mode: 'performance',
            entryName: 'metric2',
          },
          browser: {
            name: 'chrome',
            headless: false,
            windowSize: {width: 1024, height: 768},
            userAgent:
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36',
          },
          samples: [...new Array(25).fill(15), ...new Array(25).fill(25)],
          mean: {low: 18.56459, high: 21.43541},
          differences: [
            {
              absolute: {high: 12.02998, low: 7.97002},
              percentChange: {high: 132.09676, low: 67.90324},
            },
            {
              absolute: {high: 12.02998, low: 7.97002},
              percentChange: {high: 132.09676, low: 67.90324},
            },
            {
              absolute: {high: 2.02998, low: -2.02998},
              percentChange: {high: 10.14989, low: -10.14989},
            },
            null,
          ],
        },
      ],
    };
    assert.deepEqual(roundPlacesAll(actual, 5), expected);
  });
});
