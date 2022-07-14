/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {assert} from 'chai';
import {suite, test} from 'mocha';
import * as path from 'path';

import * as defaults from '../defaults.js';
import {BenchmarkSpec} from '../types.js';
import {
  hashStrings,
  makeServerPlans,
  ServerPlan,
  tachometerVersion,
} from '../versions.js';
import {testData} from './test_helpers.js';

const defaultBrowser = {
  name: defaults.browserName,
  headless: false,
  windowSize: {
    width: defaults.windowWidth,
    height: defaults.windowHeight,
  },
};

suite('versions', () => {
  suite('makeServerPlans', async () => {
    test('various', async () => {
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
          measurement: [
            {
              mode: 'performance',
              entryName: 'first-contentful-paint',
            },
          ],
          browser: defaultBrowser,
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
          measurement: [
            {
              mode: 'performance',
              entryName: 'first-contentful-paint',
            },
          ],
          browser: defaultBrowser,
        },

        // mybench and other bench only need the default server.
        {
          name: 'mybench',
          url: {
            kind: 'local',
            urlPath: '/mylib/mybench/',
            queryString: '',
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
          name: 'otherbench',
          url: {
            kind: 'local',
            urlPath: '/otherlib/otherbench/',
            queryString: '',
          },
          measurement: [
            {
              mode: 'performance',
              entryName: 'first-contentful-paint',
            },
          ],
          browser: defaultBrowser,
        },

        // A remote URL doesn't need a server.
        {
          name: 'http://example.com',
          url: {
            kind: 'remote',
            url: 'http://example.com',
          },
          measurement: [
            {
              mode: 'performance',
              entryName: 'first-contentful-paint',
            },
          ],
          browser: defaultBrowser,
        },
      ];

      const tempDir = '/tmp';
      const {plans: actualPlans, gitInstalls: actualGitInstalls} =
        await makeServerPlans(testData, tempDir, specs);

      const v1Hash = hashStrings(
        tachometerVersion,
        path.join(testData, 'mylib', 'package.json'),
        JSON.stringify([
          ['mylib', '1.0.0'],
          ['otherlib', '0.0.0'],
        ])
      );
      const v2Hash = hashStrings(
        tachometerVersion,
        path.join(testData, 'mylib', 'package.json'),
        JSON.stringify([
          ['mylib', '2.0.0'],
          ['otherlib', '0.0.0'],
        ])
      );

      const expectedPlans: ServerPlan[] = [
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
          npmInstalls: [
            {
              installDir: path.join(tempDir, v1Hash),
              packageJson: {
                private: true,
                dependencies: {
                  mylib: '1.0.0',
                  otherlib: '0.0.0',
                },
              },
            },
          ],
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
          npmInstalls: [
            {
              installDir: path.join(tempDir, v2Hash),
              packageJson: {
                private: true,
                dependencies: {
                  mylib: '2.0.0',
                  otherlib: '0.0.0',
                },
              },
            },
          ],
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

      assert.deepEqual(actualPlans, expectedPlans);
      assert.deepEqual(actualGitInstalls, []);
    });

    /**
     * Regression test for https://github.com/Polymer/tachometer/issues/82
     * where the node_modules/ directory was being mounted at the
     * "//node_modules" URL.
     */
    test('node_modules as direct child of root dir', async () => {
      const specs: BenchmarkSpec[] = [
        {
          name: 'mybench',
          url: {
            kind: 'local',
            urlPath: '/mybench/',
            version: {
              label: 'v1',
              dependencyOverrides: {mylib: '1.0.0'},
            },
            queryString: '',
          },
          measurement: [
            {
              mode: 'performance',
              entryName: 'first-contentful-paint',
            },
          ],
          browser: defaultBrowser,
        },
      ];

      const tempDir = '/tmp';
      const {plans: actualPlans, gitInstalls: actualGitInstalls} =
        await makeServerPlans(path.join(testData, 'mylib'), tempDir, specs);

      const v1Hash = hashStrings(
        tachometerVersion,
        path.join(testData, 'mylib', 'package.json'),
        JSON.stringify([
          ['mylib', '1.0.0'],
          ['otherlib', '0.0.0'],
        ])
      );
      const expectedPlans: ServerPlan[] = [
        {
          specs: [specs[0]],
          npmInstalls: [
            {
              installDir: path.join(tempDir, v1Hash),
              packageJson: {
                private: true,
                dependencies: {
                  mylib: '1.0.0',
                  otherlib: '0.0.0',
                },
              },
            },
          ],
          mountPoints: [
            {
              diskPath: path.join(tempDir, v1Hash, 'node_modules'),
              urlPath: '/node_modules',
            },
            {
              diskPath: path.join(testData, 'mylib'),
              urlPath: '/',
            },
          ],
        },
      ];

      assert.deepEqual(actualPlans, expectedPlans);
      assert.deepEqual(actualGitInstalls, []);
    });
  });
});
