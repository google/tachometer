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
import fetch from 'node-fetch';

import {Server} from '../server';
import {testData} from './test_helpers';

suite('server', () => {
  let server: Server;

  setup(async () => {
    server = await Server.start({
      host: 'localhost',
      ports: [0],  // random
      root: testData,
      resolveBareModules: true,
      mountPoints: [{
        diskPath: testData,
        urlPath: '/',
      }],
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
});
