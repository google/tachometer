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

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as path from 'path';

chai.use(chaiAsPromised);
const {assert} = chai;

import {defaultBrowserName, defaultWindowWidth, defaultWindowHeight, Config, parseConfigFile} from '../config';

const repoRoot = path.resolve(__dirname, '..', '..');
const testData = path.resolve(repoRoot, 'src', 'test', 'data');

const defaultBrowser = {
  name: defaultBrowserName,
  headless: false,
  windowSize: {
    width: defaultWindowWidth,
    height: defaultWindowHeight,
  },
};

suite('config', () => {
  suite('parseConfigFile', () => {
    let prevCwd: string;
    suiteSetup(() => {
      prevCwd = process.cwd();
      process.chdir(path.join(testData, 'mylib'));
    });

    suiteTeardown(() => {
      process.chdir(prevCwd);
    });

    test('fully specified', async () => {
      const config = {
        root: '.',
        sampleSize: 52,
        timeout: 7,
        horizons: ['0ms', '1ms', '2%', '+3%'],
        resolveBareModules: false,
        benchmarks: [
          {
            name: 'remote',
            browser: defaultBrowser,
            measurement: 'fcp',
            url: 'http://example.com?foo=bar',
          },
          {
            name: 'local',
            browser: {
              ...defaultBrowser,
              name: 'firefox',
            },
            measurement: 'callback',
            url: 'mybench/index.html?foo=bar',
            packageVersions: {
              label: 'master',
              dependencies: {
                'foo': 'github:Polymer/foo#master',
                'bar': '=1.2.3',
              },
            },
          },
        ],
      };
      const expected: Config = {
        root: '.',
        sampleSize: 52,
        timeout: 7,
        horizons: {
          absolute: [-1, 0, 1],
          relative: [-0.02, 0.02, 0.03],
        },
        resolveBareModules: false,
        mode: 'automatic',
        savePath: '',
        remoteAccessibleHost: '',
        benchmarks: [
          {
            name: 'remote',
            browser: defaultBrowser,
            measurement: 'fcp',
            url: {
              kind: 'remote',
              url: 'http://example.com?foo=bar',
            },
          },
          {
            name: 'local',
            browser: {
              ...defaultBrowser,
              name: 'firefox',
            },
            measurement: 'callback',
            url: {
              kind: 'local',
              urlPath: '/mybench/index.html',
              queryString: '?foo=bar',
              version: {
                label: 'master',
                dependencyOverrides: {
                  'foo': 'github:Polymer/foo#master',
                  'bar': '=1.2.3',
                },
              },
            },
          },
        ],
      };
      const actual = await parseConfigFile(config);
      assert.deepEqual(actual, expected);
    });

    test('defaults applied', async () => {
      const config = {
        benchmarks: [
          {
            url: 'http://example.com?foo=bar',
          },
          {
            url: 'mybench/index.html?foo=bar',
          },
        ],
      };
      const expected: Config = {
        root: '.',
        sampleSize: 50,
        timeout: 3,
        horizons: {
          absolute: [],
          relative: [0],
        },
        resolveBareModules: true,
        mode: 'automatic',
        savePath: '',
        remoteAccessibleHost: '',
        benchmarks: [
          {
            name: 'http://example.com?foo=bar',
            url: {
              kind: 'remote',
              url: 'http://example.com?foo=bar',
            },
            measurement: 'fcp',
            browser: defaultBrowser,
          },
          {
            name: '/mybench/index.html?foo=bar',
            url: {
              kind: 'local',
              urlPath: '/mybench/index.html',
              queryString: '?foo=bar',
            },
            measurement: 'callback',
            browser: defaultBrowser,
          },
        ],
      };
      const actual = await parseConfigFile(config);
      assert.deepEqual(actual, expected);
    });

    test('expanded twice deep', async () => {
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
        timeout: 3,
        horizons: {
          absolute: [],
          relative: [0],
        },
        resolveBareModules: true,
        mode: 'automatic',
        savePath: '',
        remoteAccessibleHost: '',
        benchmarks: [
          {
            name: 'http://example.com',
            url: {kind: 'remote', url: 'http://example.com'},
            measurement: 'fcp',
            browser: defaultBrowser,
          },
          {
            name: 'http://example.com',
            url: {kind: 'remote', url: 'http://example.com'},
            measurement: 'fcp',
            browser: {
              ...defaultBrowser,
              name: 'firefox',
            },
          },
          {
            name: 'http://example.com',
            url: {kind: 'remote', url: 'http://example.com'},
            measurement: 'callback',
            browser: defaultBrowser,
          },
          {
            name: 'http://example.com',
            url: {kind: 'remote', url: 'http://example.com'},
            measurement: 'callback',
            browser: {
              ...defaultBrowser,
              name: 'firefox',
            },
          },
        ],
      };
      const actual = await parseConfigFile(config);
      assert.deepEqual(actual, expected);
    });

    suite('errors', () => {
      test('invalid top-level type', async () => {
        const config = 42;
        await assert.isRejected(
            parseConfigFile(config), 'config is not of a type(s) object');
      });

      test('invalid benchmarks array type', async () => {
        const config = {
          benchmarks: 42,
        };
        await assert.isRejected(
            parseConfigFile(config),
            'config.benchmarks is not of a type(s) array');
      });

      test('invalid benchmark type', async () => {
        const config = {
          benchmarks: [42],
        };
        await assert.isRejected(
            parseConfigFile(config),
            'config.benchmarks[0] is not of a type(s) object');
      });

      test('empty benchmarks array', async () => {
        const config = {
          benchmarks: [],
        };
        await assert.isRejected(
            parseConfigFile(config),
            'config.benchmarks does not meet minimum length of 1');
      });

      test('invalid expand type', async () => {
        const config = {
          benchmarks: [
            {expand: 42},
          ],
        };
        await assert.isRejected(
            parseConfigFile(config),
            'config.benchmarks[0].expand is not of a type(s) array');
      });

      test('unknown top-level property', async () => {
        const config = {
          nonsense: 'potato',
          benchmarks: [
            {
              url: 'http://example.com',
            },
          ],
        };
        await assert.isRejected(
            parseConfigFile(config), 'config additionalProperty "nonsense"');
      });

      test('unknown benchmark property', async () => {
        const config = {
          benchmarks: [
            {
              nonsense: 'potato',
              url: 'http://example.com',
            },
          ],
        };
        await assert.isRejected(
            parseConfigFile(config),
            'config.benchmarks[0] additionalProperty "nonsense"');
      });

      test('missing url', async () => {
        const config = {
          benchmarks: [{
            browser: 'chrome',
            measurement: 'fcp',
          }],
        };
        await assert.isRejected(parseConfigFile(config), /no url specified/i);
      });

      test('unsupported browser', async () => {
        const config = {
          benchmarks: [{
            url: 'http://example.com',
            browser: 'potato',
          }],
        };
        await assert.isRejected(
            parseConfigFile(config), 'Browser potato is not supported');
      });

      test('invalid measurement', async () => {
        const config = {
          benchmarks: [{
            url: 'http://example.com',
            measurement: 'potato',
          }],
        };
        await assert.isRejected(
            parseConfigFile(config),
            'config.benchmarks[0].measurement is not one of enum values: callback');
      });

      test('sampleSize too small', async () => {
        const config = {
          sampleSize: 1,
          benchmarks: [{
            url: 'http://example.com',
          }],
        };
        await assert.isRejected(
            parseConfigFile(config),
            'config.sampleSize must have a minimum value of 2');
      });

      test('non-integer sampleSize', async () => {
        const config = {
          sampleSize: 2.1,
          benchmarks: [{
            url: 'http://example.com',
          }],
        };
        await assert.isRejected(
            parseConfigFile(config),
            'config.sampleSize is not of a type(s) integer');
      });

      test('missing package version label', async () => {
        const config = {
          benchmarks: [
            {
              url: '/my/local.index',
              packageVersions: {
                dependencies: {
                  'foo': '=1.2.3',
                },
              },
            },
          ],
        };
        await assert.isRejected(
            parseConfigFile(config),
            'config.benchmarks[0].packageVersions requires property "label"');
      });
    });
  });
});
