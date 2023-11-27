/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {suite, suiteSetup, suiteTeardown, test} from 'mocha';
import * as path from 'path';

import * as defaults from '../defaults.js';
import {optDefs, Opts} from '../flags.js';
import {specsFromOpts} from '../specs.js';
import {BenchmarkSpec} from '../types.js';

import {testData} from './test_helpers.js';

import commandLineArgs from 'command-line-args';

import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

chai.use(chaiAsPromised);
const {assert} = chai;

const parse = (argv: string[]) =>
  commandLineArgs(optDefs, {argv, partial: true}) as Opts;

const defaultBrowser = {
  name: defaults.browserName,
  headless: false,
  windowSize: {
    width: defaults.windowWidth,
    height: defaults.windowHeight,
  },
};

suite('specsFromOpts', () => {
  let prevCwd: string;
  suiteSetup(() => {
    prevCwd = process.cwd();
    process.chdir(path.join(testData, 'mylib'));
  });

  suiteTeardown(() => {
    process.chdir(prevCwd);
  });

  test('nothing', async () => {
    const actual = await specsFromOpts(parse([]));
    assert.deepEqual(actual, []);
  });

  test('remote url', async () => {
    const argv = ['http://example.com'];
    const actual = await specsFromOpts(parse(argv));
    const expected: BenchmarkSpec[] = [
      {
        name: 'http://example.com',
        url: {
          kind: 'remote',
          url: 'http://example.com',
        },
        browser: defaultBrowser,
        measurement: [
          {
            mode: 'performance',
            entryName: 'first-contentful-paint',
          },
        ],
      },
    ];
    assert.deepEqual(actual, expected);
  });

  test('remote url with label', async () => {
    const argv = ['potato=http://example.com'];
    const actual = await specsFromOpts(parse(argv));
    const expected: BenchmarkSpec[] = [
      {
        name: 'potato',
        url: {
          kind: 'remote',
          url: 'http://example.com',
        },
        browser: defaultBrowser,
        measurement: [
          {
            mode: 'performance',
            entryName: 'first-contentful-paint',
          },
        ],
      },
    ];
    assert.deepEqual(actual, expected);
  });

  test('local file', async () => {
    const argv = ['mybench/index.html'];
    const actual = await specsFromOpts(parse(argv));
    const expected: BenchmarkSpec[] = [
      {
        name: 'mybench/index.html',
        url: {
          kind: 'local',
          urlPath: '/mybench/index.html',
          queryString: '',
          version: undefined,
        },
        browser: defaultBrowser,
        measurement: [
          {
            mode: 'callback',
          },
        ],
      },
    ];
    assert.deepEqual(actual, expected);
  });

  test('local absolute file', async () => {
    const argv = [path.resolve('mybench/index.html')];
    const actual = await specsFromOpts(parse(argv));
    const expected: BenchmarkSpec[] = [
      {
        name: 'mybench/index.html',
        url: {
          kind: 'local',
          urlPath: '/mybench/index.html',
          queryString: '',
          version: undefined,
        },
        browser: defaultBrowser,
        measurement: [
          {
            mode: 'callback',
          },
        ],
      },
    ];
    assert.deepEqual(actual, expected);
  });

  test('local file with label', async () => {
    const argv = ['potato=mybench/index.html'];
    const actual = await specsFromOpts(parse(argv));
    const expected: BenchmarkSpec[] = [
      {
        name: 'potato',
        url: {
          kind: 'local',
          urlPath: '/mybench/index.html',
          queryString: '',
          version: undefined,
        },
        browser: defaultBrowser,
        measurement: [
          {
            mode: 'callback',
          },
        ],
      },
    ];
    assert.deepEqual(actual, expected);
  });

  test('local directory', async () => {
    const argv = ['mybench/'];
    const actual = await specsFromOpts(parse(argv));
    const expected: BenchmarkSpec[] = [
      {
        name: 'mybench',
        url: {
          kind: 'local',
          urlPath: '/mybench/',
          queryString: '',
          version: undefined,
        },
        browser: defaultBrowser,
        measurement: [
          {
            mode: 'callback',
          },
        ],
      },
    ];
    assert.deepEqual(actual, expected);
  });

  test('local directory with query params', async () => {
    const argv = ['mybench?foo=bar'];
    const actual = await specsFromOpts(parse(argv));
    const expected: BenchmarkSpec[] = [
      {
        name: 'mybench',
        url: {
          kind: 'local',
          urlPath: '/mybench/',
          queryString: '?foo=bar',
          version: undefined,
        },
        browser: defaultBrowser,
        measurement: [
          {
            mode: 'callback',
          },
        ],
      },
    ];
    assert.deepEqual(actual, expected);
  });

  test('local directory with query params and label', async () => {
    const argv = ['potato=mybench?foo=bar'];
    const actual = await specsFromOpts(parse(argv));
    const expected: BenchmarkSpec[] = [
      {
        name: 'potato',
        url: {
          kind: 'local',
          urlPath: '/mybench/',
          queryString: '?foo=bar',
          version: undefined,
        },
        browser: defaultBrowser,
        measurement: [
          {
            mode: 'callback',
          },
        ],
      },
    ];
    assert.deepEqual(actual, expected);
  });

  test('local directory with versions', async () => {
    const argv = [
      'mybench',
      '--package-version=mylib@1.0.0',
      '--package-version=v2=mylib@2.0.0',
    ];
    const actual = await specsFromOpts(parse(argv));
    const expected: BenchmarkSpec[] = [
      {
        name: 'mybench',
        url: {
          kind: 'local',
          urlPath: '/mybench/',
          queryString: '',
          version: {
            label: 'mylib@1.0.0',
            dependencyOverrides: {
              mylib: '1.0.0',
            },
          },
        },
        browser: defaultBrowser,
        measurement: [
          {
            mode: 'callback',
          },
        ],
      },
      {
        name: 'mybench',
        url: {
          kind: 'local',
          urlPath: '/mybench/',
          queryString: '',
          version: {
            label: 'v2',
            dependencyOverrides: {
              mylib: '2.0.0',
            },
          },
        },
        browser: defaultBrowser,
        measurement: [
          {
            mode: 'callback',
          },
        ],
      },
    ];
    assert.deepEqual(actual, expected);
  });

  suite('errors', () => {
    test('no such file', async () => {
      const argv = ['not-a-file'];
      await assert.isRejected(specsFromOpts(parse(argv)), /no such file/i);
    });

    test('not accessible from server root', async () => {
      const argv = [path.resolve(__dirname, '..', '..')];
      await assert.isRejected(
        specsFromOpts(parse(argv)),
        /not accessible from server root/i
      );
    });

    test('did not contain an index.html', async () => {
      const argv = ['noindex'];
      await assert.isRejected(
        specsFromOpts(parse(argv)),
        /did not contain an index\.html/i
      );
    });

    test('browser not supported', async () => {
      const argv = ['mybench', '--browser=potato'];
      await assert.isRejected(
        specsFromOpts(parse(argv)),
        /browser potato is not supported/i
      );
    });
  });
});
