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
import {formatCsvRaw, formatCsvStats} from '../csv';
import {fakeResults} from './test_helpers';

/**
 * It's hard to visually verify raw CSV output, so this lets us align the
 * columns visually, but then remove that padding before comparison.
 */
const removePadding = (readable: string): string =>
    readable.replace(/ *, */g, ',').replace(/ *\n */gm, '\n').trim() + '\n';

suite('csv', () => {
  test('stats: 2x2 matrix with quoting', async () => {
    const config: ConfigFile = {
      benchmarks: [
        {
          name: 'foo',
          url: 'http://example.com?foo',
        },
        {
          name: 'bar,baz',
          url: 'http://example.com?bar,baz',
        },
      ],
    };
    const results = await fakeResults(config);
    const actual = formatCsvStats(results);
    const expected = removePadding(`
         ,         ,         ,    vs foo,           ,          ,         ,  "vs bar,baz",           ,          ,
         ,       ms,         ,  % change,           , ms change,         ,      % change,           , ms change,
         ,      min,      max,       min,        max,       min,      max,           min,        max,       min,      max
      foo,  8.56459, 11.43541,          ,           ,          ,         ,    -58.02419%, -41.97581%, -12.02998, -7.97002
"bar,baz", 18.56459, 21.43541, 67.90324%, 132.09676%,   7.97002, 12.02998,              ,           ,          ,
    `);
    assert.equal(actual, expected);
  });

  test('raw samples: 2x2 matrix with quoting', async () => {
    const config: ConfigFile = {
      sampleSize: 4,
      benchmarks: [
        {
          name: 'foo',
          url: 'http://example.com?foo',
        },
        {
          name: 'bar,baz',
          url: 'http://example.com?bar,baz',
        },
        {
          name: 'qux',
          url: 'http://example.com?qux',
        },
      ],
    };
    const results = await fakeResults(config);
    const actual = formatCsvRaw(results);
    const expected = removePadding(`
    foo, "bar,baz", qux
    5,   15,        25
    5,   15,        25
    15,  25,        35
    15,  25,        35
    `);
    assert.equal(actual, expected);
  });
});
