/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {suite, suiteSetup, suiteTeardown, test} from 'mocha';
import * as path from 'path';

chai.use(chaiAsPromised);
const {assert} = chai;

import {Config} from '../config.js';
import {parseConfigFile} from '../configfile.js';
import * as defaults from '../defaults.js';
import {testData} from './test_helpers.js';

const defaultBrowser = {
  name: defaults.browserName,
  headless: false,
  windowSize: {
    width: defaults.windowWidth,
    height: defaults.windowHeight,
  },
};

const configFilePath = path.join(testData, 'mylib', 'tachometer.json');
const configFileDir = path.dirname(configFilePath);

suite('config', () => {
  suite('parseConfigFile', () => {
    let prevCwd: string;
    suiteSetup(() => {
      prevCwd = process.cwd();
      process.chdir(configFileDir);
    });

    suiteTeardown(() => {
      process.chdir(prevCwd);
    });

    test('fully specified', async () => {
      const config = {
        root: configFileDir,
        sampleSize: 52,
        timeout: 7,
        autoSampleConditions: ['0ms', '1ms', '2%', '+3%'],
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
        root: configFileDir,
        sampleSize: 52,
        timeout: 7,
        autoSampleConditions: {
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
      const actual = await parseConfigFile(config, configFilePath);
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
        root: configFileDir,
        sampleSize: undefined,
        timeout: undefined,
        autoSampleConditions: undefined,
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
      const actual = await parseConfigFile(config, configFilePath);
      assert.deepEqual(actual, expected);
    });

    test('paths are relative to config file path', async () => {
      const config = {
        root: '..',
        benchmarks: [
          {
            url: 'mybench/index.html',
          },
        ],
      };
      const expected: Partial<Config> = {
        root: path.dirname(configFileDir),
        sampleSize: undefined,
        timeout: undefined,
        autoSampleConditions: undefined,
        resolveBareModules: undefined,
        benchmarks: [
          {
            name: '/mylib/mybench/index.html',
            url: {
              kind: 'local',
              urlPath: '/mylib/mybench/index.html',
              queryString: '',
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
      const actual = await parseConfigFile(config, configFilePath);
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
        root: configFileDir,
        sampleSize: undefined,
        timeout: undefined,
        autoSampleConditions: undefined,
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
      const actual = await parseConfigFile(config, configFilePath);
      assert.deepEqual(actual, expected);
    });

    test('expanded twice deep', async () => {
      const config = {
        root: configFileDir,
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
        root: configFileDir,
        sampleSize: undefined,
        timeout: undefined,
        autoSampleConditions: undefined,
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
      const actual = await parseConfigFile(config, configFilePath);
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
        root: configFileDir,
        sampleSize: undefined,
        timeout: undefined,
        autoSampleConditions: undefined,
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
      const actual = await parseConfigFile(config, configFilePath);
      assert.deepEqual(actual, expected);
    });

    test('trace option - true', async () => {
      const config = {
        benchmarks: [
          {
            url: 'http://example.com?foo=bar',
            browser: {name: 'chrome', trace: true},
          },
          {
            url: 'http://example.com?test=1',
            browser: {name: 'chrome', trace: true},
          },
        ],
      };
      const expected: Partial<Config> = {
        root: configFileDir,
        sampleSize: undefined,
        timeout: undefined,
        autoSampleConditions: undefined,
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
              trace: {
                categories: defaults.traceCategories,
                logDir: path.join(defaults.traceLogDir, 'example.comfoo=bar'),
              },
            },
          },
          {
            name: 'http://example.com?test=1',
            url: {
              kind: 'remote',
              url: 'http://example.com?test=1',
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
              trace: {
                categories: defaults.traceCategories,
                logDir: path.join(defaults.traceLogDir, 'example.comtest=1'),
              },
            },
          },
        ],
      };
      const actual = await parseConfigFile(config, configFilePath);
      assert.deepEqual(actual, expected);
    });

    test('trace option - config object', async () => {
      const config = {
        benchmarks: [
          {
            name: 'benchmark',
            url: 'mybench/index.html',
            packageVersions: {label: 'version1', dependencies: {}},
            browser: {
              name: 'chrome',
              trace: {categories: ['test'], logDir: 'test'},
            },
          },
          {
            name: 'benchmark',
            url: 'mybench/index.html',
            packageVersions: {label: 'version2', dependencies: {}},
            browser: {
              name: 'chrome',
              trace: {categories: ['test'], logDir: 'test'},
            },
          },
        ],
      };
      const expected: Partial<Config> = {
        root: configFileDir,
        sampleSize: undefined,
        timeout: undefined,
        autoSampleConditions: undefined,
        resolveBareModules: undefined,
        benchmarks: [
          {
            name: 'benchmark',
            url: {
              kind: 'local',
              queryString: '',
              urlPath: '/mybench/index.html',
              version: {label: 'version1', dependencyOverrides: {}},
            },
            measurement: [
              {
                mode: 'callback',
              },
            ],
            browser: {
              name: 'chrome',
              headless: false,
              windowSize: {
                width: defaults.windowWidth,
                height: defaults.windowHeight,
              },
              trace: {
                categories: ['test'],
                logDir: path.join(process.cwd(), 'test', 'version1'),
              },
            },
          },
          {
            name: 'benchmark',
            url: {
              kind: 'local',
              queryString: '',
              urlPath: '/mybench/index.html',
              version: {label: 'version2', dependencyOverrides: {}},
            },
            measurement: [
              {
                mode: 'callback',
              },
            ],
            browser: {
              name: 'chrome',
              headless: false,
              windowSize: {
                width: defaults.windowWidth,
                height: defaults.windowHeight,
              },
              trace: {
                categories: ['test'],
                logDir: path.join(process.cwd(), 'test', 'version2'),
              },
            },
          },
        ],
      };
      const actual = await parseConfigFile(config, configFilePath);
      assert.deepEqual(actual, expected);
    });

    suite('errors', () => {
      test('invalid top-level type', async () => {
        const config = 42;
        await assert.isRejected(
          parseConfigFile(config, configFilePath),
          'config is not of a type(s) object'
        );
      });

      test('invalid benchmarks array type', async () => {
        const config = {
          benchmarks: 42,
        };
        await assert.isRejected(
          parseConfigFile(config, configFilePath),
          'config.benchmarks is not of a type(s) array'
        );
      });

      test('invalid benchmark type', async () => {
        const config = {
          benchmarks: [42],
        };
        await assert.isRejected(
          parseConfigFile(config, configFilePath),
          'config.benchmarks[0] is not of a type(s) object'
        );
      });

      test('empty benchmarks array', async () => {
        const config = {
          benchmarks: [],
        };
        await assert.isRejected(
          parseConfigFile(config, configFilePath),
          'config.benchmarks does not meet minimum length of 1'
        );
      });

      test('invalid expand type', async () => {
        const config = {
          benchmarks: [{expand: 42}],
        };
        await assert.isRejected(
          parseConfigFile(config, configFilePath),
          'config.benchmarks[0].expand is not of a type(s) array'
        );
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
          parseConfigFile(config, configFilePath),
          'config is not allowed to have the additional property "nonsense"'
        );
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
          parseConfigFile(config, configFilePath),
          'config.benchmarks[0] is not allowed to have the additional property "nonsense"'
        );
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
        await assert.isRejected(
          parseConfigFile(config, configFilePath),
          /no url specified/i
        );
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
          parseConfigFile(config, configFilePath),
          'Browser potato is not supported'
        );
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
          parseConfigFile(config, configFilePath),
          'config.benchmarks[0].measurement is not any of: callback, fcp'
        );
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
          parseConfigFile(config, configFilePath),
          'config.sampleSize must be greater than or equal to 2'
        );
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
          parseConfigFile(config, configFilePath),
          'config.sampleSize is not of a type(s) integer'
        );
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
          parseConfigFile(config, configFilePath),
          'config.benchmarks[0].packageVersions requires property "label"'
        );
      });

      test('Error to use both horizons and autoSampleConditions', async () => {
        const config = {
          autoSampleConditions: ['0'],
          horizons: ['0'],
          benchmarks: [
            {
              url: 'https://example.com/',
            },
          ],
        };
        await assert.isRejected(
          parseConfigFile(config, configFilePath),
          'Please use only "autoSampleConditions" and not "horizons".'
        );
      });
    });
  });
});
