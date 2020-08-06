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
import {promises as fs} from 'fs';
import {suite, test} from 'mocha';
import * as os from 'os';
import * as path from 'path';

import {assertResolvable, onDemandDependenciesFromPackageJSON} from '../install';

suite('install', () => {
  suite('onDemandDependenciesFromPackageJSON', () => {
    test('only includes packages enumerated in "installsOnDemand"', () => {
      const dependencies = onDemandDependenciesFromPackageJSON({
        devDependencies: {foo: '*'},
        dependencies: {bar: '*'},
        installsOnDemand: ['baz'],
      });

      assert.isFalse(dependencies.has('foo'));
      assert.isFalse(dependencies.has('bar'));
      assert.isTrue(dependencies.has('baz'));
    });
  });

  suite('assertResolvable', () => {
    test('resolves for resolvable module specifiers', async () => {
      await assertResolvable('chai');
    });

    test('rejects for not-resolvable module specifiers', async () => {
      let rejected = false;

      try {
        await assertResolvable('./definitely-not-resolvable.js');
      } catch {
        rejected = true;
      }

      assert.isTrue(rejected);
    });

    test(
        'eventually resolves a module that was installed asynchronously',
        async () => {
          let rejected = false;
          const someModulePath = path.join(os.tmpdir(), 'foo.js');

          try {
            await assertResolvable(someModulePath);
          } catch {
            rejected = true;
          }

          assert.isTrue(rejected);

          await fs.writeFile(someModulePath, 'console.log("hi")');

          await assertResolvable(someModulePath);

          await fs.unlink(someModulePath);
        });
  });
});
