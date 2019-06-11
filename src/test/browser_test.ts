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
        remoteUrl: '',
      });
    });

    test('chrome-headless', () => {
      assert.deepEqual(parseAndValidateBrowser('chrome-headless'), {
        name: 'chrome',
        headless: true,
        remoteUrl: '',
      });
    });

    test('firefox', () => {
      assert.deepEqual(parseAndValidateBrowser('firefox'), {
        name: 'firefox',
        headless: false,
        remoteUrl: '',
      });
    });

    test('firefox-headless', () => {
      assert.deepEqual(parseAndValidateBrowser('firefox-headless'), {
        name: 'firefox',
        headless: true,
        remoteUrl: '',
      });
    });

    test('safari', () => {
      assert.deepEqual(parseAndValidateBrowser('safari'), {
        name: 'safari',
        headless: false,
        remoteUrl: '',
      });
    });

    test('chrome remote', () => {
      assert.deepEqual(parseAndValidateBrowser('chrome@http://example.com'), {
        name: 'chrome',
        headless: false,
        remoteUrl: 'http://example.com',
      });
    });

    test('chrome-headless remote', () => {
      assert.deepEqual(
          parseAndValidateBrowser('chrome-headless@http://example.com'), {
            name: 'chrome',
            headless: true,
            remoteUrl: 'http://example.com',
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

      test('empty remote url', () => {
        assert.throws(
            () => parseAndValidateBrowser('chrome@'),
            /expected url after "@"/i);
      });

      test('invalid remote url', () => {
        assert.throws(
            () => parseAndValidateBrowser('chrome@potato'),
            /invalid remote url "potato"/i);
      });
    });
  });
});
