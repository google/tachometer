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

import {defaultBrowserName, defaultWindowHeight, defaultWindowWidth} from '../config';
import {optDefs, Opts} from '../flags';
import {specsFromOpts} from '../specs';
import {BenchmarkSpec} from '../types';

import commandLineArgs = require('command-line-args');

chai.use(chaiAsPromised);
const {assert} = chai;

const repoRoot = path.resolve(__dirname, '..', '..');
const testData = path.resolve(repoRoot, 'src', 'test', 'data');

const parse = (argv: string[]) =>
    commandLineArgs(optDefs, {argv, partial: true}) as Opts;

const defaultBrowser = {
  name: defaultBrowserName,
  headless: false,
  windowSize: {
    width: defaultWindowWidth,
    height: defaultWindowHeight,
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
        measurement: 'fcp',
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
        measurement: 'fcp',
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
        measurement: 'callback',
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
        measurement: 'callback',
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
        measurement: 'callback',
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
        measurement: 'callback',
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
        measurement: 'callback',
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
        measurement: 'callback',
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
        measurement: 'callback',
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
        measurement: 'callback',
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
      const argv = [repoRoot];
      await assert.isRejected(
          specsFromOpts(parse(argv)), /not accessible from server root/i);
    });

    test('did not contain an index.html', async () => {
      const argv = ['noindex'];
      await assert.isRejected(
          specsFromOpts(parse(argv)), /did not contain an index\.html/i);
    });

    test('browser not supported', async () => {
      const argv = ['mybench', '--browser=potato'];
      await assert.isRejected(
          specsFromOpts(parse(argv)), /browser potato is not supported/i);
    });
  });
});
