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
import {suite, suiteSetup, suiteTeardown, test} from 'mocha';

import {Config, makeConfig, parseHorizons} from '../config';
import {parseFlags} from '../flags';

import {testData} from './test_helpers';

suite('makeConfig', function() {
  let prevCwd: string;

  suiteSetup(() => {
    prevCwd = process.cwd();
    process.chdir(testData);
  });

  suiteTeardown(() => {
    process.chdir(prevCwd);
  });

  async function checkConfig(argv: string[], expected: Config) {
    const actual = await makeConfig(parseFlags(argv));
    assert.deepEqual(actual, expected);
  }

  test('local file with all defaults', async () => {
    const argv = ['random-global.html'];
    const expected: Config = {
      mode: 'automatic',
      sampleSize: 50,
      timeout: 3,
      root: '.',
      resolveBareModules: true,
      forceCleanNpmInstall: false,
      horizons: {absolute: [], relative: [0]},
      remoteAccessibleHost: '',
      jsonFile: '',
      legacyJsonFile: '',
      csvFile: '',
      githubCheck: undefined,
      benchmarks: [
        {
          browser: {
            headless: false,
            name: 'chrome',
            windowSize: {
              height: 768,
              width: 1024,
            },
          },
          measurement: 'callback',
          name: 'random-global.html',
          url: {
            kind: 'local',
            queryString: '',
            urlPath: '/random-global.html',
            version: undefined,
          },
        },
      ],
    };
    await checkConfig(argv, expected);
  });

  test('config file', async () => {
    const argv = ['--config=random-global.json'];
    const expected: Config = {
      mode: 'automatic',
      sampleSize: 50,
      timeout: 3,
      root: '.',
      resolveBareModules: true,
      forceCleanNpmInstall: false,
      horizons: {absolute: [], relative: [0]},
      remoteAccessibleHost: '',
      jsonFile: '',
      legacyJsonFile: '',
      csvFile: '',
      // TODO(aomarks) Be consistent about undefined vs unset.
      githubCheck: undefined,
      benchmarks: [
        {
          browser: {
            headless: false,
            name: 'chrome',
            windowSize: {
              height: 768,
              width: 1024,
            },
          },
          measurement: 'callback',
          // TODO(aomarks) Why does this have a forward-slash?
          name: '/random-global.html',
          url: {
            kind: 'local',
            queryString: '',
            urlPath: '/random-global.html',
          },
        },
      ],
    };
    await checkConfig(argv, expected);
  });

  test('config file with --manual', async () => {
    const argv = ['--config=random-global.json', '--manual'];
    const expected: Config = {
      mode: 'manual',

      sampleSize: 50,
      timeout: 3,
      root: '.',
      resolveBareModules: true,
      forceCleanNpmInstall: false,
      horizons: {absolute: [], relative: [0]},
      remoteAccessibleHost: '',
      jsonFile: '',
      legacyJsonFile: '',
      csvFile: '',
      githubCheck: undefined,
      benchmarks: [
        {
          browser: {
            headless: false,
            name: 'chrome',
            windowSize: {
              height: 768,
              width: 1024,
            },
          },
          measurement: 'callback',
          // TODO(aomarks) Why does this have a forward-slash?
          name: '/random-global.html',
          url: {
            kind: 'local',
            queryString: '',
            urlPath: '/random-global.html',
          },
        },
      ],
    };
    await checkConfig(argv, expected);
  });

  test('config file with output files and force clean install', async () => {
    const argv = [
      '--config=random-global.json',
      '--csv-file=out.csv',
      '--json-file=out.json',
      '--force-clean-npm-install',
    ];
    const expected: Config = {
      mode: 'automatic',
      csvFile: 'out.csv',
      jsonFile: 'out.json',
      legacyJsonFile: '',
      forceCleanNpmInstall: true,

      sampleSize: 50,
      timeout: 3,
      root: '.',
      resolveBareModules: true,
      horizons: {absolute: [], relative: [0]},
      remoteAccessibleHost: '',
      // TODO(aomarks) Be consistent about undefined vs unset.
      githubCheck: undefined,
      benchmarks: [
        {
          browser: {
            headless: false,
            name: 'chrome',
            windowSize: {
              height: 768,
              width: 1024,
            },
          },
          measurement: 'callback',
          // TODO(aomarks) Why does this have a forward-slash?
          name: '/random-global.html',
          url: {
            kind: 'local',
            queryString: '',
            urlPath: '/random-global.html',
          },
        },
      ],
    };
    await checkConfig(argv, expected);
  });
});

suite('parseHorizons', function() {
  test('0ms', () => {
    assert.deepEqual(parseHorizons(['0ms']), {
      absolute: [0],
      relative: [],
    });
  });

  test('0.1ms', () => {
    assert.deepEqual(parseHorizons(['0.1ms']), {
      absolute: [-0.1, 0.1],
      relative: [],
    });
  });

  test('+0.1ms', () => {
    assert.deepEqual(parseHorizons(['+0.1ms']), {
      absolute: [0.1],
      relative: [],
    });
  });

  test('-0.1ms', () => {
    assert.deepEqual(parseHorizons(['-0.1ms']), {
      absolute: [-0.1],
      relative: [],
    });
  });

  test('0ms,0.1,1ms', () => {
    assert.deepEqual(parseHorizons(['0ms', '0.1ms', '1ms']), {
      absolute: [-1, -0.1, 0, 0.1, 1],
      relative: [],
    });
  });

  test('0%', () => {
    assert.deepEqual(parseHorizons(['0%']), {
      absolute: [],
      relative: [0],
    });
  });

  test('1%', () => {
    assert.deepEqual(parseHorizons(['1%']), {
      absolute: [],
      relative: [-0.01, 0.01],
    });
  });

  test('+1%', () => {
    assert.deepEqual(parseHorizons(['+1%']), {
      absolute: [],
      relative: [0.01],
    });
  });

  test('-1%', () => {
    assert.deepEqual(parseHorizons(['-1%']), {
      absolute: [],
      relative: [-0.01],
    });
  });

  test('0%,1%,10%', () => {
    assert.deepEqual(parseHorizons(['0%', '1%', '10%']), {
      absolute: [],
      relative: [-0.1, -0.01, 0, 0.01, 0.10],
    });
  });

  test('0ms,0.1ms,1ms,0%,1%,10%', () => {
    assert.deepEqual(
        parseHorizons(['0ms', '0.1ms', '1ms', '0%', '1%', '10%']), {
          absolute: [-1, -0.1, 0, 0.1, 1],
          relative: [-0.1, -0.01, 0, 0.01, 0.10],
        });
  });

  test('throws on nonsense', () => {
    assert.throws(() => parseHorizons(['sailboat']));
  });

  test('throws on ambiguous unit', () => {
    assert.throws(() => parseHorizons(['4']));
  });
});
