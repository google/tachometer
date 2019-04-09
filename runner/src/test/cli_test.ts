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

import {parseBoundariesFlag, pickBaselineFn} from '../cli';
import {ResultStats, SummaryStats} from '../stats';
import {BenchmarkResult, BenchmarkSpec} from '../types';

const fakeSpec: BenchmarkSpec = {
  name: 'fakeName',
  variant: 'fakeVariant',
  implementation: 'fakeImplementation',
  version: {label: 'fakeVersion', dependencyOverrides: {}},
  browser: 'fakeBrowser',
  config: {},
};

const fakeStats: SummaryStats = {
  size: 0,
  mean: 0,
  meanCI: {low: 0, high: 0},
  variance: 0,
  standardDeviation: 0,
  relativeStandardDeviation: 0,
};

const fakeResult: BenchmarkResult = {
  runId: 'fakeRunId',
  name: 'fakeName',
  variant: 'fakeVariant',
  implementation: 'fakeImplementation',
  version: 'fakeVersion',
  millis: [],
  paintMillis: [],
  browser: {name: 'fakeBrowserName', version: 'fakeBrowserVersion'},
  bytesSent: 0,
};

suite('pickBaseline', function() {
  const specs: BenchmarkSpec[] = [
    {
      ...fakeSpec,
      version: {label: 'v1', dependencyOverrides: {}},
    },
    {
      ...fakeSpec,
      version: {label: 'v2', dependencyOverrides: {}},
    },
    {
      ...fakeSpec,
      version: {label: 'v3', dependencyOverrides: {}},
    },
  ];
  const results: ResultStats[] = [
    {
      result: {
        ...fakeResult,
        version: 'v1',
      },
      stats: {
        ...fakeStats,
        mean: 30,  // slowest
      },
    },
    {
      result: {
        ...fakeResult,
        version: 'v2',
      },
      stats: {
        ...fakeStats,
        mean: 10,  // fastest
      },
    },
    {
      result: {
        ...fakeResult,
        version: 'v3',
      },
      stats: {
        ...fakeStats,
        mean: 20,
      },
    },
  ];

  test('picks fastest result', () => {
    const fn = pickBaselineFn(specs, 'fastest');
    assert.deepEqual(fn(results), results[1]);
  });

  test('picks slowest result', () => {
    const fn = pickBaselineFn(specs, 'slowest');
    assert.deepEqual(fn(results), results[0]);
  });

  test('picks when fully specified', () => {
    const fn = pickBaselineFn(
        specs,
        ('name=fakeName,implementation=fakeImplementation,' +
         'variant=fakeVariant,version=v1'));
    assert.deepEqual(fn(results), results[0]);
  });

  test('picks when partially but unambiguously specified', () => {
    const fn = pickBaselineFn(specs, 'version=v3');
    assert.deepEqual(fn(results), results[2]);
  });

  test('throws on ambiguous pick', () => {
    assert.throws(() => pickBaselineFn(specs, 'name=fakeName'));
  });

  test('throws on empty pick', () => {
    assert.throws(() => pickBaselineFn(specs, 'version=noSuchVersion'));
  });
});

suite('parseBoundaryFlag', function() {
  test('0', () => {
    assert.deepEqual(parseBoundariesFlag('0'), {
      absolute: [0],
      relative: [],
    });
  });

  test('0.1', () => {
    assert.deepEqual(parseBoundariesFlag('0.1'), {
      absolute: [-0.1, 0.1],
      relative: [],
    });
  });

  test('+0.1', () => {
    assert.deepEqual(parseBoundariesFlag('+0.1'), {
      absolute: [0.1],
      relative: [],
    });
  });

  test('-0.1', () => {
    assert.deepEqual(parseBoundariesFlag('-0.1'), {
      absolute: [-0.1],
      relative: [],
    });
  });

  test('0,0.1,1', () => {
    assert.deepEqual(parseBoundariesFlag('0,0.1,1'), {
      absolute: [-1, -0.1, 0, 0.1, 1],
      relative: [],
    });
  });

  test('0%', () => {
    assert.deepEqual(parseBoundariesFlag('0%'), {
      absolute: [],
      relative: [0],
    });
  });

  test('1%', () => {
    assert.deepEqual(parseBoundariesFlag('1%'), {
      absolute: [],
      relative: [-0.01, 0.01],
    });
  });

  test('+1%', () => {
    assert.deepEqual(parseBoundariesFlag('+1%'), {
      absolute: [],
      relative: [0.01],
    });
  });

  test('-1%', () => {
    assert.deepEqual(parseBoundariesFlag('-1%'), {
      absolute: [],
      relative: [-0.01],
    });
  });

  test('0%,1%,10%', () => {
    assert.deepEqual(parseBoundariesFlag('0%,1%,10%'), {
      absolute: [],
      relative: [-0.1, -0.01, 0, 0.01, 0.10],
    });
  });

  test('0,0.1,1,0%,1%,10%', () => {
    assert.deepEqual(parseBoundariesFlag('0,0.1,1,0%,1%,10%'), {
      absolute: [-1, -0.1, 0, 0.1, 1],
      relative: [-0.1, -0.01, 0, 0.01, 0.10],
    });
  });
});
