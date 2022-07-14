/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {assert} from 'chai';
import fsExtra from 'fs-extra';
import {setup, suite, teardown, test} from 'mocha';
import fetch from 'node-fetch';
import * as path from 'path';

import {Server} from '../server.js';

import {testData} from './test_helpers.js';

suite('server', () => {
  let server: Server;

  setup(async () => {
    server = await Server.start({
      host: 'localhost',
      ports: [0], // random
      root: testData,
      resolveBareModules: true,
      npmInstalls: [],
      mountPoints: [
        {
          diskPath: testData,
          urlPath: '/',
        },
      ],
      cache: true,
    });
  });

  teardown(async () => {
    await server.close();
  });

  test('serves bench.js library', async () => {
    const res = await fetch(`${server.url}/bench.js`);
    assert.equal(res.status, 200);
    assert.include(await res.text(), 'performance.now()');
  });

  suite('bare modules', () => {
    test('resolves specifier in JS file', async () => {
      const res = await fetch(`${server.url}/import-bare-module.js`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.include(body, 'node_modules/dep1/dep1.js');
      assert.notInclude(body, `'dep1'`);
    });

    test('resolves specifier in HTML file', async () => {
      const res = await fetch(`${server.url}/import-bare-module.html`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.include(body, 'node_modules/dep1/dep1.js');
      assert.notInclude(body, `'dep1'`);
    });

    test('serves invalid JS unchanged', async () => {
      const res = await fetch(`${server.url}/invalid-js.js`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.include(body, 'this is not valid javascript');
    });

    test('serves invalid JS in HTML unchanged', async () => {
      const res = await fetch(`${server.url}/invalid-js.html`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.include(body, 'this is not valid javascript');
    });
  });

  suite('bare modules with custom npm installs', async () => {
    setup(async () => {
      const installDir = path.join(testData, 'alt_npm_install_dir');
      const packageJson = fsExtra.readJSONSync(
        path.join(installDir, 'package.json')
      );

      // Close the base server and replace it with a custom server that is
      // configured with a custom npm install directory
      await server.close();

      server = await Server.start({
        host: 'localhost',
        ports: [0], // random
        root: testData,
        resolveBareModules: true,
        npmInstalls: [{installDir, packageJson}],
        mountPoints: [
          {
            diskPath: testData,
            urlPath: '/',
          },
        ],
        cache: true,
      });
    });

    test('resolves specifier in JS file to alt file', async () => {
      const res = await fetch(`${server.url}/import-bare-module.js`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.include(body, 'node_modules/dep1/dep1-main.js');
      assert.notInclude(body, `/dep1.js'`);
      assert.notInclude(body, `'dep1'`);
    });

    test('resolves specifier in HTML file to alt file', async () => {
      const res = await fetch(`${server.url}/import-bare-module.html`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.include(body, 'node_modules/dep1/dep1-main.js');
      assert.notInclude(body, `/dep1.js'`);
      assert.notInclude(body, `'dep1'`);
    });
  });

  test('records bytes served in session', async () => {
    let session;

    await fetch(`${server.url}/1_byte.txt`);
    session = server.endSession();
    assert.equal(session.bytesSent, 1);

    await fetch(`${server.url}/1_byte.txt`);
    await fetch(`${server.url}/3_bytes.txt`);
    session = server.endSession();
    assert.equal(session.bytesSent, 4);

    session = server.endSession();
    assert.equal(session.bytesSent, 0);
  });
});
