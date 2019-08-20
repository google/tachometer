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

const jstat = require('jstat');

import {assert} from 'chai';
import {summaryStats, computeDifference, intervalContains} from '../stats';

suite('statistics', function() {
  test('confidence intervals', function() {
    this.timeout(3 * 60 * 1000);  // Lots of arithmetic.

    // Increasing the number of trials increases the precision of our long-term
    // estimate of the proportion of correct confidence intervals (see below).
    // Empirically, this lets us reliably assert the proportion +/- 0.01.
    const numTrials = 20000;

    // How many randomized configurations of hypothetical benchmarks to test.
    // More is better, but since we need a lot of trials, each scenario can take
    // many seconds.
    const numScenarios = 10;

    for (let s = 0; s < numScenarios; s++) {
      // Pick random parameters for our true distributions (imagine as the
      // underlying characteristics of some hypothetical benchmarks), and a
      // random number of samples to draw from those distributions (imagine as
      // the value of the --sample-size flag).
      const trueMeanA = randFloat(0.01, 1000);
      const trueMeanB = randFloat(0.01, 1000);
      const trueAbsoluteDifference = trueMeanB - trueMeanA;
      const trueRelativeDifference = (trueMeanB - trueMeanA) / trueMeanA;
      const stdDevA = randFloat(0.01, 10);
      const stdDevB = randFloat(0.01, 10);
      const sampleSize = randInt(50, 1000);

      // Imagine each trial as an end-to-end invocation of the benchmark runner.
      // Keep track of how often our confidence interval contains the true mean.
      let numGoodA = 0;
      let numGoodB = 0;
      let numGoodAbsoluteDiff = 0;
      let numGoodRelativeDiff = 0;
      for (let t = 0; t < numTrials; t++) {
        // TODO It does not theoretically matter if our underlying data is
        // normally distributed. Test with some other underlying distributions,
        // e.g. poisson, to verify.
        const valuesA = randNormalValues(sampleSize, trueMeanA, stdDevA);
        const valuesB = randNormalValues(sampleSize, trueMeanB, stdDevB);
        const statsA = summaryStats(valuesA);
        const statsB = summaryStats(valuesB);
        const difference = computeDifference(statsA, statsB);
        if (intervalContains(statsA.meanCI, trueMeanA)) {
          numGoodA++;
        }
        if (intervalContains(statsB.meanCI, trueMeanB)) {
          numGoodB++;
        }
        if (intervalContains(difference.absolute, trueAbsoluteDifference)) {
          numGoodAbsoluteDiff++;
        }
        if (intervalContains(difference.relative, trueRelativeDifference)) {
          numGoodRelativeDiff++;
        }
      }

      // We should expect, since we are using confidence = 0.95, that over the
      // long-run, the confidence intervals we generate should contain the true
      // mean 95% of the time (this is the definition of a confidence interval).
      assert.closeTo(numGoodA / numTrials, 0.95, 0.01);
      assert.closeTo(numGoodB / numTrials, 0.95, 0.01);
      assert.closeTo(numGoodAbsoluteDiff / numTrials, 0.95, 0.01);
      assert.closeTo(numGoodRelativeDiff / numTrials, 0.95, 0.01);
    }
  });
});

/**
 * Generate random numbers from the normal distribution with the given mean and
 * standard deviation.
 */
const randNormalValues =
    (size: number, mean: number, stdDev: number): number[] => {
      // Note jstat.randn generates random numbers from the standard normal
      // distribution (which has mean 0 and standard deviation 1) hence we must
      // transform it to our distribution.
      const [vals] = jstat.randn(1, size) as [number[]];
      return vals.map((v) => v * stdDev + mean);
    };

/**
 * Min inclusive, max exclusive.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#Examples
 */
const randFloat = (min: number, max: number): number =>
    Math.random() * (max - min) + min;

/**
 * Min inclusive, max exclusive.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#Examples
 */
const randInt = (min: number, max: number): number => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};
