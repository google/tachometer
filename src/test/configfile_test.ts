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
import chaiAsPromised from 'chai-as-promised';
import {suite, suiteSetup, suiteTeardown, test} from 'mocha';
import * as path from 'path';

chai.use(chaiAsPromised);
const {assert} = chai;

import {Config} from '../config';
import {parseConfigFile} from '../configfile';
import * as defaults from '../defaults';
import {testData} from './test_helpers';

const defaultBrowser = {
  name: defaults.browserName,
  headless: false,
  windowSize: {
    width: defaults.windowWidth,
    height: defaults.windowHeight,
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
            measurement: {
              mode: 'performance',
              entryName: 'first-contentful-paint',
            },
            url: 'http://example.com?foo=bar',
          },
          {
            name: 'local',
            browser: {
              ...defaultBrowser,
              name: 'firefox',
              preferences: {
                'layout.css.shadow-parts.enabled': true,
              },
            },
            measurement: {mode: 'callback'},
            url: 'mybench/index.html?foo=bar',
            packageVersions: {
              label: 'master',
              dependencies: {
                foo: 'github:Polymer/foo#master',
                bar: '=1.2.3',
              },
            },
          },
          {
            name: 'local-or-remote',
            browser: {
              ...defaultBrowser,
              name: 'chrome',
              cpuThrottlingRate: 6,
            },
            measurement: {
              mode: 'performance',
              entryName: 'first-contentful-paint',
            },
            url: 'http://example.com?foo=bar',
          },
        ],
      };
      const expected: Partial<Config> = {
        root: '.',
        sampleSize: 52,
        timeout: 7,
        horizons: {
          absolute: [-1, 0, 1],
          relative: [-0.02, 0.02, 0.03],
        },
        resolveBareModules: false,
        benchmarks: [
          {
            name: 'remote',
            browser: defaultBrowser,
            measurement: [
              {
                mode: 'performance',
                entryName: 'first-contentful-paint',
              },
            ],
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
              preferences: {
                'layout.css.shadow-parts.enabled': true,
              },
            },
            measurement: [
              {
                mode: 'callback',
              },
            ],
            url: {
              kind: 'local',
              urlPath: '/mybench/index.html',
              queryString: '?foo=bar',
              version: {
                label: 'master',
                dependencyOverrides: {
                  foo: 'github:Polymer/foo#master',
                  bar: '=1.2.3',
                },
              },
            },
          },
          {
            name: 'local-or-remote',
            browser: {
              ...defaultBrowser,
              name: 'chrome',
              cpuThrottlingRate: 6,
            },
            measurement: [
              {
                mode: 'performance',
                entryName: 'first-contentful-paint',
              },
            ],
            url: {
              kind: 'remote',
              url: 'http://example.com?foo=bar',
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
      const expected: Partial<Config> = {
        root: '.',
        sampleSize: undefined,
        timeout: undefined,
        horizons: undefined,
        resolveBareModules: undefined,
        benchmarks: [
          {
            name: 'http://example.com?foo=bar',
            url: {
              kind: 'remote',
              url: 'http://example.com?foo=bar',
            },
            measurement: [
              {
                mode: 'performance',
                entryName: 'first-contentful-paint',
              },
            ],
            browser: defaultBrowser,
          },
          {
            name: '/mybench/index.html?foo=bar',
            url: {
              kind: 'local',
              urlPath: '/mybench/index.html',
              queryString: '?foo=bar',
            },
            measurement: [
              {
                mode: 'callback',
              },
            ],
            browser: defaultBrowser,
          },
        ],
      };
      const actual = await parseConfigFile(config);
      assert.deepEqual(actual, expected);
    });

    test('object-style measurement specifications', async () => {
      const config = {
        benchmarks: [
          {
            url: 'mybench/index.html?foo=a',
            measurement: {
              mode: 'callback',
            },
          },
          {
            url: 'mybench/index.html?foo=b',
            measurement: {
              mode: 'expression',
              expression: 'window.foo',
            },
          },
          {
            url: 'mybench/index.html?foo=c',
            measurement: {
              mode: 'performance',
              entryName: 'foo-measure',
            },
          },
        ],
      };
      const expected: Partial<Config> = {
        root: '.',
        sampleSize: undefined,
        timeout: undefined,
        horizons: undefined,
        resolveBareModules: undefined,
        benchmarks: [
          {
            name: '/mybench/index.html?foo=a',
            url: {
              kind: 'local',
              urlPath: '/mybench/index.html',
              queryString: '?foo=a',
            },
            measurement: [
              {
                mode: 'callback',
              },
            ],
            browser: defaultBrowser,
          },
          {
            name: '/mybench/index.html?foo=b',
            url: {
              kind: 'local',
              urlPath: '/mybench/index.html',
              queryString: '?foo=b',
            },
            measurement: [
              {
                mode: 'expression',
                expression: 'window.foo',
              },
            ],
            browser: defaultBrowser,
          },
          {
            name: '/mybench/index.html?foo=c',
            url: {
              kind: 'local',
              urlPath: '/mybench/index.html',
              queryString: '?foo=c',
            },
            measurement: [
              {
                mode: 'performance',
                entryName: 'foo-measure',
              },
            ],
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
        benchmarks: [
          {
            url: 'http://example.com',
            expand: [
              {
                measurement: {
                  mode: 'performance',
                  entryName: 'first-contentful-paint',
                },
                expand: [{browser: 'chrome'}, {browser: 'firefox'}],
              },
              {
                measurement: {mode: 'callback'},
                expand: [{browser: 'chrome'}, {browser: 'firefox'}],
              },
            ],
          },
        ],
      };
      const expected: Partial<Config> = {
        root: '.',
        sampleSize: undefined,
        timeout: undefined,
        horizons: undefined,
        resolveBareModules: undefined,
        benchmarks: [
          {
            name: 'http://example.com',
            url: {kind: 'remote', url: 'http://example.com'},
            measurement: [
              {
                mode: 'performance',
                entryName: 'first-contentful-paint',
              },
            ],
            browser: defaultBrowser,
          },
          {
            name: 'http://example.com',
            url: {kind: 'remote', url: 'http://example.com'},
            measurement: [
              {
                mode: 'performance',
                entryName: 'first-contentful-paint',
              },
            ],
            browser: {
              ...defaultBrowser,
              name: 'firefox',
            },
          },
          {
            name: 'http://example.com',
            url: {kind: 'remote', url: 'http://example.com'},
            measurement: [
              {
                mode: 'callback',
              },
            ],
            browser: defaultBrowser,
          },
          {
            name: 'http://example.com',
            url: {kind: 'remote', url: 'http://example.com'},
            measurement: [
              {
                mode: 'callback',
              },
            ],
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

    test('binary path and arguments', async () => {
      const config = {
        benchmarks: [
          {
            url: 'http://example.com?foo=bar',
            browser: {
              name: 'chrome',
              binary: '/my/special/chrome',
              addArguments: ['be-good'],
              removeArguments: ['be-bad'],
            },
          },
        ],
      };
      const expected: Partial<Config> = {
        root: '.',
        sampleSize: undefined,
        timeout: undefined,
        horizons: undefined,
        resolveBareModules: undefined,
        benchmarks: [
          {
            name: 'http://example.com?foo=bar',
            url: {
              kind: 'remote',
              url: 'http://example.com?foo=bar',
            },
            measurement: [
              {
                mode: 'performance',
                entryName: 'first-contentful-paint',
              },
            ],
            browser: {
              name: 'chrome',
              headless: false,
              windowSize: {
                width: defaults.windowWidth,
                height: defaults.windowHeight,
              },
              binary: '/my/special/chrome',
              addArguments: ['be-good'],
              removeArguments: ['be-bad'],
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
          benchmarks: [{expand: 42}],
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
          benchmarks: [
            {
              browser: 'chrome',
              measurement: {
                mode: 'performance',
                entryName: 'first-contentful-paint',
              },
            },
          ],
        };
        await assert.isRejected(parseConfigFile(config), /no url specified/i);
      });

      test('unsupported browser', async () => {
        const config = {
          benchmarks: [
            {
              url: 'http://example.com',
              browser: 'potato',
            },
          ],
        };
        await assert.isRejected(
            parseConfigFile(config), 'Browser potato is not supported');
      });

      test('invalid measurement', async () => {
        const config = {
          benchmarks: [
            {
              url: 'http://example.com',
              measurement: 'potato',
            },
          ],
        };
        await assert.isRejected(
            parseConfigFile(config),
            'config.benchmarks[0].measurement is not one of: callback, fcp');
      });

      test('sampleSize too small', async () => {
        const config = {
          sampleSize: 1,
          benchmarks: [
            {
              url: 'http://example.com',
            },
          ],
        };
        await assert.isRejected(
            parseConfigFile(config),
            'config.sampleSize must have a minimum value of 2');
      });

      test('non-integer sampleSize', async () => {
        const config = {
          sampleSize: 2.1,
          benchmarks: [
            {
              url: 'http://example.com',
            },
          ],
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
                  foo: '=1.2.3',
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
