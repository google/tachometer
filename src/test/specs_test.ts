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

import * as path from 'path';

import {optDefs, Opts} from '../cli';
import {specsFromOpts} from '../specs';
import {BenchmarkSpec} from '../types';

import commandLineArgs = require('command-line-args');

const repoRoot = path.resolve(__dirname, '..', '..');
const testData = path.resolve(repoRoot, 'src', 'test', 'data');

const parse = (argv: string[]) =>
    commandLineArgs(optDefs, {argv, partial: true}) as Opts;

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
        browser: 'chrome',
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
        browser: 'chrome',
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
          version: {
            label: 'default',
            dependencyOverrides: {},
          },
        },
        browser: 'chrome',
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
          version: {
            label: 'default',
            dependencyOverrides: {},
          },
        },
        browser: 'chrome',
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
          version: {
            label: 'default',
            dependencyOverrides: {},
          },
        },
        browser: 'chrome',
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
          version: {
            label: 'default',
            dependencyOverrides: {},
          },
        },
        browser: 'chrome',
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
          version: {
            label: 'default',
            dependencyOverrides: {},
          },
        },
        browser: 'chrome',
        measurement: 'callback',
      },
    ];
    assert.deepEqual(actual, expected);
  });

  test('local directory with versions', async () => {
    const argv = [
      'mybench',
      '--package-version=mylib@1.0.0',
      '--package-version=mylib@2.0.0',
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
        browser: 'chrome',
        measurement: 'callback',
      },
      {
        name: 'mybench',
        url: {
          kind: 'local',
          urlPath: '/mybench/',
          queryString: '',
          version: {
            label: 'mylib@2.0.0',
            dependencyOverrides: {
              mylib: '2.0.0',
            },
          },
        },
        browser: 'chrome',
        measurement: 'callback',
      },
    ];
    assert.deepEqual(actual, expected);
  });
});
