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

import {optDefs, Opts} from '../cli';
import {specsFromOpts} from '../specs';

import commandLineArgs = require('command-line-args');

const parse = (argv: string[]) =>
    commandLineArgs(optDefs, {argv, partial: true}) as Opts;

suite('specsFromOpts', () => {
  test('nothing', async () => {
    const specs = await specsFromOpts(parse([]));
    assert.deepEqual(specs, []);
  });

  test('url', async () => {
    const argv = ['http://example.com'];
    const specs = await specsFromOpts(parse(argv));
    assert.deepEqual(specs, [
      {
        browser: 'chrome',
        measurement: 'fcp',
        name: 'http://example.com',
        url: {
          kind: 'remote',
          url: 'http://example.com',
        },
      },
    ]);
  });
});
