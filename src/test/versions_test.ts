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
import {hashStrings, makeServerPlans, ServerPlan} from '../versions';

const repoRoot = path.resolve(__dirname, '..', '..');
const testData = path.resolve(repoRoot, 'src', 'test', 'data');

suite('versions', () => {
  test('makeServerPlans', async () => {
    const specs: BenchmarkSpec[] = [
      // mybench running with two custom versions.
      {
        name: 'mybench',
        url: {
          kind: 'local',
          urlPath: '/mylib/mybench/',
          version: {
            label: 'v1',
            dependencyOverrides: {
              mylib: '1.0.0',
            },
          },
          queryString: '',
        },
        measurement: 'fcp',
        browser: 'chrome',
      },
      {
        name: 'mybench',
        url: {
          kind: 'local',
          urlPath: '/mylib/mybench/',
          version: {
            label: 'v2',
            dependencyOverrides: {
              mylib: '2.0.0',
            },
          },
          queryString: '',
        },
        measurement: 'fcp',
        browser: 'chrome',
      },

      // mybench and other bench only need the default server.
      {
        name: 'mybench',
        url: {
          kind: 'local',
          urlPath: '/mylib/mybench/',
          queryString: '',
        },
        measurement: 'fcp',
        browser: 'chrome',
      },
      {
        name: 'otherbench',
        url: {
          kind: 'local',
          urlPath: '/otherlib/otherbench/',
          queryString: '',
        },
        measurement: 'fcp',
        browser: 'chrome',
      },

      // A remote URL doesn't need a server.
      {
        name: 'http://example.com',
        url: {
          kind: 'remote',
          url: 'http://example.com',
        },
        measurement: 'fcp',
        browser: 'chrome',
      },
    ];

    const tempDir = '/tmp';
    const actual = await makeServerPlans(testData, tempDir, specs);

    const v1Hash = hashStrings(path.join(testData, 'mylib'), 'v1');
    const v2Hash = hashStrings(path.join(testData, 'mylib'), 'v2');

    const expected: ServerPlan[] = [
      {
        specs: [specs[2], specs[3]],
        npmInstalls: [],
        mountPoints: [
          {
            diskPath: testData,
            urlPath: '/',
          },
        ],
      },

      {
        specs: [specs[0]],
        npmInstalls: [{
          installDir: path.join(tempDir, v1Hash),
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
            diskPath: path.join(tempDir, v1Hash, 'node_modules'),
            urlPath: '/mylib/node_modules',
          },
          {
            diskPath: testData,
            urlPath: '/',
          },
        ],
      },

      {
        specs: [specs[1]],
        npmInstalls: [{
          installDir: path.join(tempDir, v2Hash),
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
            diskPath: path.join(tempDir, v2Hash, 'node_modules'),
            urlPath: '/mylib/node_modules',
          },
          {
            diskPath: testData,
            urlPath: '/',
          },
        ],
      },
    ];

    assert.deepEqual(actual, expected);
  });
});
