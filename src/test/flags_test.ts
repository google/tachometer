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

import {parseFlags} from '../flags';

suite('flags', () => {
  suite('parseFlags', () => {
    suite('--resolve-bare-modules', () => {
      test('unset is true', () => {
        const actual = parseFlags([]);
        assert.isTrue(actual['resolve-bare-modules']);
      });

      test('set but empty is true', () => {
        const argv = ['--resolve-bare-modules'];
        const actual = parseFlags(argv);
        assert.isTrue(actual['resolve-bare-modules']);
      });

      test('true is true', () => {
        const argv = ['--resolve-bare-modules=true'];
        const actual = parseFlags(argv);
        assert.isTrue(actual['resolve-bare-modules']);
      });

      test('false is false', () => {
        const argv = ['--resolve-bare-modules=false'];
        const actual = parseFlags(argv);
        assert.isFalse(actual['resolve-bare-modules']);
      });

      test('potato errors', () => {
        const argv = ['--resolve-bare-modules=potato'];
        assert.throw(() => parseFlags(argv), /invalid --resolve-bare-modules/i);
      });
    });
  });
});
