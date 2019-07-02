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

import {BrowserName, parseBrowserConfigString, validateBrowserConfig} from '../browser';
import {defaultBrowserName, defaultWindowHeight, defaultWindowWidth} from '../config';

suite('browser', () => {
  suite('parseBrowserConfigString', () => {
    test('chrome', () => {
      assert.deepEqual(parseBrowserConfigString('chrome'), {
        name: 'chrome',
        headless: false,
      });
    });

    test('chrome-headless', () => {
      assert.deepEqual(parseBrowserConfigString('chrome-headless'), {
        name: 'chrome',
        headless: true,
      });
    });

    test('firefox', () => {
      assert.deepEqual(parseBrowserConfigString('firefox'), {
        name: 'firefox',
        headless: false,
      });
    });

    test('firefox-headless', () => {
      assert.deepEqual(parseBrowserConfigString('firefox-headless'), {
        name: 'firefox',
        headless: true,
      });
    });

    test('safari', () => {
      assert.deepEqual(parseBrowserConfigString('safari'), {
        name: 'safari',
        headless: false,
      });
    });

    test('chrome remote', () => {
      assert.deepEqual(parseBrowserConfigString('chrome@http://example.com'), {
        name: 'chrome',
        headless: false,
        remoteUrl: 'http://example.com',
      });
    });

    test('chrome-headless remote', () => {
      assert.deepEqual(
          parseBrowserConfigString('chrome-headless@http://example.com'), {
            name: 'chrome',
            headless: true,
            remoteUrl: 'http://example.com',
          });
    });
  });

  suite('validateBrowserConfig', () => {
    const defaultBrowser = {
      name: defaultBrowserName,
      headless: false,
      windowSize: {
        width: defaultWindowWidth,
        height: defaultWindowHeight,
      },
    };

    test('unsupported browser', () => {
      assert.throws(
          () => validateBrowserConfig({
            ...defaultBrowser,
            name: 'potato' as BrowserName,
          }),
          /browser potato is not supported/i);
    });

    test('headless not supported', () => {
      assert.throws(
          () => validateBrowserConfig({
            ...defaultBrowser,
            name: 'safari',
            headless: true,
          }),
          /browser safari does not support headless/i);
    });

    test('empty remote url', () => {
      assert.throws(
          () => validateBrowserConfig({
            ...defaultBrowser,
            remoteUrl: '',
          }),
          /invalid browser remote url ""/i);
    });

    test('invalid remote url', () => {
      assert.throws(
          () => validateBrowserConfig({
            ...defaultBrowser,
            remoteUrl: 'potato',
          }),
          /invalid browser remote url "potato"/i);
    });

    test('invalid window size', () => {
      assert.throws(
          () => validateBrowserConfig({
            ...defaultBrowser,
            windowSize: {
              width: -1,
              height: -1,
            },
          }),
          /invalid window size/i);
    });
  });
});
