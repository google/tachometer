/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {assert} from 'chai';
import {suite, test} from 'mocha';

import {
  BrowserName,
  parseBrowserConfigString,
  validateBrowserConfig,
} from '../browser.js';
import * as defaults from '../defaults.js';

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
        parseBrowserConfigString('chrome-headless@http://example.com'),
        {
          name: 'chrome',
          headless: true,
          remoteUrl: 'http://example.com',
        }
      );
    });
  });

  suite('validateBrowserConfig', () => {
    const defaultBrowser = {
      name: defaults.browserName,
      headless: false,
      windowSize: {
        width: defaults.windowWidth,
        height: defaults.windowHeight,
      },
    };

    test('unsupported browser', () => {
      assert.throws(
        () =>
          validateBrowserConfig({
            ...defaultBrowser,
            name: 'potato' as BrowserName,
          }),
        /browser potato is not supported/i
      );
    });

    test('headless not supported', () => {
      assert.throws(
        () =>
          validateBrowserConfig({
            ...defaultBrowser,
            name: 'safari',
            headless: true,
          }),
        /browser safari does not support headless/i
      );
    });

    test('empty remote url', () => {
      assert.throws(
        () =>
          validateBrowserConfig({
            ...defaultBrowser,
            remoteUrl: '',
          }),
        /invalid browser remote url ""/i
      );
    });

    test('invalid remote url', () => {
      assert.throws(
        () =>
          validateBrowserConfig({
            ...defaultBrowser,
            remoteUrl: 'potato',
          }),
        /invalid browser remote url "potato"/i
      );
    });

    test('invalid window size', () => {
      assert.throws(
        () =>
          validateBrowserConfig({
            ...defaultBrowser,
            windowSize: {
              width: -1,
              height: -1,
            },
          }),
        /invalid window size/i
      );
    });
  });
});
