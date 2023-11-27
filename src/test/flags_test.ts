/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {assert} from 'chai';
import {suite, test} from 'mocha';

import {parseFlags} from '../flags.js';

suite('flags', () => {
  suite('parseFlags', () => {
    suite('--resolve-bare-modules', () => {
      test('unset is undefined', () => {
        const actual = parseFlags([]);
        assert.isUndefined(actual['resolve-bare-modules']);
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

      test('--horizon is converted to --auto-sample-conditions', () => {
        const argv = ['--horizon=0,10%'];
        const actual = parseFlags(argv);
        assert.equal(actual['auto-sample-conditions'], '0,10%');
      });

      test('Error to use both --horizon and --auto-sample-conditions', () => {
        const argv = ['--horizon=0,10%', '--auto-sample-conditions=0,10%'];
        assert.throw(
          () => parseFlags(argv),
          'Please use only --auto-sample-conditions and not --horizons'
        );
      });
    });
  });
});
