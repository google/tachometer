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

import {BenchmarkSpec} from '../types';
import {makeServerPlans, ServerPlan} from '../versions';

const repoRoot = path.resolve(__dirname, '..', '..');
const testData = path.resolve(repoRoot, 'src', 'test', 'data');

suite('versions', () => {
  test('makeServerPlans', async () => {
    const specs: BenchmarkSpec[] = [
      // mybench running with two custom versions.
      {
        name: 'mybench',
        implementation: 'mylib',
        version: {
          label: 'v1',
          dependencyOverrides: {
            mylib: '1.0.0',
          },
        },
        measurement: 'fcp',
        queryString: '',
        browser: 'chrome',
      },
      {
        name: 'mybench',
        implementation: 'mylib',
        version: {
          label: 'v2',
          dependencyOverrides: {
            mylib: '2.0.0',
          },
        },
        measurement: 'fcp',
        queryString: '',
        browser: 'chrome',
      },

      // mybench and other bench only need the default server.
      {
        name: 'mybench',
        implementation: 'mylib',
        version: {
          label: 'default',
          dependencyOverrides: {},
        },
        measurement: 'fcp',
        queryString: '',
        browser: 'chrome',
      },
      {
        name: 'otherbench',
        implementation: 'otherlib',
        version: {
          label: 'default',
          dependencyOverrides: {},
        },
        measurement: 'fcp',
        queryString: '',
        browser: 'chrome',
      },

      // A remote URL doesn't need a server.
      {
        name: 'http://example.com',
        url: 'http://example.com',
        implementation: '',
        version: {
          label: '',
          dependencyOverrides: {},
        },
        measurement: 'fcp',
        queryString: '',
        browser: 'chrome',
      },
    ];

    const actual = await makeServerPlans(testData, specs);

    const expected: ServerPlan[] = [
      {
        specs: [specs[2], specs[3]],
        npmInstalls: [],
        mountPoints: [],
      },

      {
        specs: [specs[0]],
        npmInstalls: [{
          installDir: path.join(testData, 'mylib', 'versions', 'v1'),
          packageJson: {
            private: true,
            dependencies: {
              mylib: '1.0.0',
              otherlib: '0.0.0',
            },
          },
        }],
        mountPoints: [
          {
            diskPath:
                path.join(testData, 'mylib', 'versions', 'v1', 'node_modules'),
            urlPath: '/benchmarks/mylib/versions/v1/node_modules',
          },
          {
            diskPath: path.join(testData, 'mylib'),
            urlPath: '/benchmarks/mylib/versions/v1',
          },
        ],
      },

      {
        specs: [specs[1]],
        npmInstalls: [{
          installDir: path.join(testData, 'mylib', 'versions', 'v2'),
          packageJson: {
            private: true,
            dependencies: {
              mylib: '2.0.0',
              otherlib: '0.0.0',
            },
          },
        }],
        mountPoints: [
          {
            diskPath:
                path.join(testData, 'mylib', 'versions', 'v2', 'node_modules'),
            urlPath: '/benchmarks/mylib/versions/v2/node_modules',
          },
          {
            diskPath: path.join(testData, 'mylib'),
            urlPath: '/benchmarks/mylib/versions/v2',
          },
        ],
      },
    ];

    assert.deepEqual(actual, expected);
  });
});
