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
import {suite, test} from 'mocha';

import {ConfigFile} from '../configfile';
import {jsonOutput, JsonOutputFile} from '../json-output';
import {fakeResults} from './test_helpers';

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
  return Math.round(num * (10 ** places)) / (10 ** places);
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
});
