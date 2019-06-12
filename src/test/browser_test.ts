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
import {parseAndValidateBrowser} from '../browser';

suite('browser', () => {
  suite('parseAndValidateBrowser', () => {
    test('chrome', () => {
      assert.deepEqual(parseAndValidateBrowser('chrome'), {
        name: 'chrome',
        headless: false,
      });
    });

    test('chrome-headless', () => {
      assert.deepEqual(parseAndValidateBrowser('chrome-headless'), {
        name: 'chrome',
        headless: true,
      });
    });

    test('firefox', () => {
      assert.deepEqual(parseAndValidateBrowser('firefox'), {
        name: 'firefox',
        headless: false,
      });
    });

    test('firefox-headless', () => {
      assert.deepEqual(parseAndValidateBrowser('firefox-headless'), {
        name: 'firefox',
        headless: true,
      });
    });

    test('safari', () => {
      assert.deepEqual(parseAndValidateBrowser('safari'), {
        name: 'safari',
        headless: false,
      });
    });

    suite('errors', () => {
      test('unsupported browser', () => {
        assert.throws(
            () => parseAndValidateBrowser('potato'),
            /browser potato is not supported/i);
      });

      test('headless not supported', () => {
        assert.throws(
            () => parseAndValidateBrowser('safari-headless'),
            /browser safari does not support headless/i);
      });
    });
  });
});
