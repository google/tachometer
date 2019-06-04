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

import {Config, parseConfig} from '../config';

suite('config', () => {
  suite('parseConfig', () => {
    test('fully specified', () => {
      const config = {
        root: '/my/root',
        benchmarks: [{
          name: 'example',
          url: 'http://example.com',
          measurement: 'fcp',
          browser: 'chrome',
        }],
      };
      const expected: Config = {
        root: '/my/root',
        benchmarks: [{
          name: 'example',
          url: {kind: 'remote', url: 'http://example.com'},
          measurement: 'fcp',
          browser: 'chrome',
        }],
      };
      const actual = parseConfig(config);
      assert.deepEqual(actual, expected);
    });

    test('defaults applied', () => {
      const config = {
        benchmarks: [
          {
            url: 'http://example.com?foo=bar',
          },
          {
            url: './local/path?foo=bar',
          },
        ],
      };
      const expected: Config = {
        root: '.',
        benchmarks: [
          {
            name: 'http://example.com?foo=bar',
            url: {
              kind: 'remote',
              url: 'http://example.com?foo=bar',
            },
            measurement: 'fcp',
            browser: 'chrome',
          },
          {
            name: './local/path?foo=bar',
            url: {
              kind: 'local',
              urlPath: './local/path',
              queryString: '?foo=bar',
              version: {
                label: 'default',
                dependencyOverrides: {},
              },
            },
            measurement: 'callback',
            browser: 'chrome',
          },
        ],
      };
      const actual = parseConfig(config);
      assert.deepEqual(actual, expected);
    });

    test('expanded twice deep', () => {
      const config = {
        root: '.',
        benchmarks: [{
          url: 'http://example.com',
          expand: [
            {
              measurement: 'fcp',
              expand: [
                {browser: 'chrome'},
                {browser: 'firefox'},
              ],
            },
            {
              measurement: 'callback',
              expand: [
                {browser: 'chrome'},
                {browser: 'firefox'},
              ],
            }
          ],
        }],
      };
      const expected: Config = {
        root: '.',
        benchmarks: [
          {
            name: 'http://example.com',
            url: {kind: 'remote', url: 'http://example.com'},
            measurement: 'fcp',
            browser: 'chrome',
          },
          {
            name: 'http://example.com',
            url: {kind: 'remote', url: 'http://example.com'},
            measurement: 'fcp',
            browser: 'firefox',
          },
          {
            name: 'http://example.com',
            url: {kind: 'remote', url: 'http://example.com'},
            measurement: 'callback',
            browser: 'chrome',
          },
          {
            name: 'http://example.com',
            url: {kind: 'remote', url: 'http://example.com'},
            measurement: 'callback',
            browser: 'firefox',
          },
        ],
      };
      const actual = parseConfig(config);
      assert.deepEqual(actual, expected);
    });

    suite('errors', () => {
      test('invalid top-level type', () => {
        const config = 42;
        assert.throws(() => parseConfig(config), /invalid config format/i);
      });

      test('invalid benchmarks type', () => {
        const config = {
          benchmarks: 42,
        };
        assert.throws(
            () => parseConfig(config), /benchmarks must be an array/i);
      });

      test('invalid benchmark type', () => {
        const config = {
          benchmarks: [42],
        };
        assert.throws(
            () => parseConfig(config), /benchmark must be an object/i);
      });

      test('invalid expand type', () => {
        const config = {
          benchmarks: [
            {expand: 42},
          ],
        };
        assert.throws(() => parseConfig(config), /expand must be an array/i);
      });

      test('unknown key', () => {
        const config = {
          url: 'http://example.com',
          nonsense: 'potato',
        };
        assert.throws(() => parseConfig(config), /unknown config key/i);
      });

      test('missing url', () => {
        const config = {
          benchmarks: [{
            browser: 'chrome',
            measurement: 'fcp',
          }],
        };
        assert.throws(() => parseConfig(config), /no url specified/i);
      });

      test('unsupported browser', () => {
        const config = {
          benchmarks: [{
            url: 'http://example.com',
            browser: 'potato',
          }],
        };
        assert.throws(() => parseConfig(config), /browser not supported/i);
      });

      test('invalid measurement', () => {
        const config = {
          benchmarks: [{
            url: 'http://example.com',
            measurement: 'potato',
          }],
        };
        assert.throws(() => parseConfig(config), /invalid measurement/i);
      });
    });
  });
});
