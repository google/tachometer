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

import {Config, parseConfigFile} from '../config';

suite('config', () => {
  suite('parseConfigFile', () => {
    test('fully specified', () => {
      const config = {
        root: '/my/root',
        sampleSize: 52,
        benchmarks: [{
          name: 'example',
          url: 'http://example.com',
          measurement: 'fcp',
          browser: 'chrome',
        }],
      };
      const expected: Config = {
        root: '/my/root',
        sampleSize: 52,
        benchmarks: [{
          name: 'example',
          url: {kind: 'remote', url: 'http://example.com'},
          measurement: 'fcp',
          browser: 'chrome',
        }],
      };
      const actual = parseConfigFile(config);
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
        sampleSize: 50,
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
      const actual = parseConfigFile(config);
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
        sampleSize: 50,
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
      const actual = parseConfigFile(config);
      assert.deepEqual(actual, expected);
    });

    suite('errors', () => {
      test('invalid top-level type', () => {
        const config = 42;
        assert.throws(
            () => parseConfigFile(config), 'config is not of a type(s) object');
      });

      test('invalid benchmarks array type', () => {
        const config = {
          benchmarks: 42,
        };
        assert.throws(
            () => parseConfigFile(config),
            'config.benchmarks is not of a type(s) array');
      });

      test('invalid benchmark type', () => {
        const config = {
          benchmarks: [42],
        };
        assert.throws(
            () => parseConfigFile(config),
            'config.benchmarks[0] is not of a type(s) object');
      });

      test('empty benchmarks array', () => {
        const config = {
          benchmarks: [],
        };
        assert.throws(
            () => parseConfigFile(config),
            'config.benchmarks does not meet minimum length of 1');
      });

      test('invalid expand type', () => {
        const config = {
          benchmarks: [
            {expand: 42},
          ],
        };
        assert.throws(
            () => parseConfigFile(config),
            'config.benchmarks[0].expand is not of a type(s) array');
      });

      test('unknown top-level property', () => {
        const config = {
          nonsense: 'potato',
          benchmarks: [
            {
              url: 'http://example.com',
            },
          ],
        };
        assert.throws(
            () => parseConfigFile(config),
            'config additionalProperty "nonsense"');
      });

      test('unknown benchmark property', () => {
        const config = {
          benchmarks: [
            {
              nonsense: 'potato',
              url: 'http://example.com',
            },
          ],
        };
        assert.throws(
            () => parseConfigFile(config),
            'config.benchmarks[0] additionalProperty "nonsense"');
      });

      test('missing url', () => {
        const config = {
          benchmarks: [{
            browser: 'chrome',
            measurement: 'fcp',
          }],
        };
        assert.throws(() => parseConfigFile(config), /no url specified/i);
      });

      test('unsupported browser', () => {
        const config = {
          benchmarks: [{
            url: 'http://example.com',
            browser: 'potato',
          }],
        };
        assert.throws(
            () => parseConfigFile(config),
            'config.benchmarks[0].browser is not one of enum values: chrome');
      });

      test('invalid measurement', () => {
        const config = {
          benchmarks: [{
            url: 'http://example.com',
            measurement: 'potato',
          }],
        };
        assert.throws(
            () => parseConfigFile(config),
            'config.benchmarks[0].measurement is not one of enum values: callback');
      });

      test('sampleSize too small', () => {
        const config = {
          sampleSize: 1,
          benchmarks: [{
            url: 'http://example.com',
          }],
        };
        assert.throws(
            () => parseConfigFile(config),
            'config.sampleSize must have a minimum value of 2');
      });

      test('non-integer sampleSize', () => {
        const config = {
          sampleSize: 2.1,
          benchmarks: [{
            url: 'http://example.com',
          }],
        };
        assert.throws(
            () => parseConfigFile(config),
            'config.sampleSize is not of a type(s) integer');
      });
    });
  });
});
