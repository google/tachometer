/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {assert} from 'chai';
import {existsSync, promises as fs} from 'fs';
import {suite, test} from 'mocha';
import * as os from 'os';
import * as path from 'path';

import {
  assertResolvable,
  onDemandDependenciesFromPackageJSON,
} from '../install.js';

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

    test('eventually resolves a module that was installed asynchronously', async () => {
      let rejected = false;
      const someModulePath = path.join(os.tmpdir(), 'foo.js');
      if (existsSync(someModulePath)) {
        await fs.unlink(someModulePath);
      }

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
