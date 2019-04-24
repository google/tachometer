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

import {BenchmarkResult} from './types';

const jstat = require('jstat');  // TODO Contribute typings.

interface Distribution {
  mean: number;
  variance: number;
}

export interface ConfidenceInterval {
  low: number;
  high: number;
}

export interface SummaryStats {
  size: number;
  mean: number;
  meanCI: ConfidenceInterval;
  variance: number;
  standardDeviation: number;
  relativeStandardDeviation: number;
}

export interface ResultStats {
  result: BenchmarkResult;
  stats: SummaryStats;
  isBaseline?: boolean;
  differences?: Array<Slowdown|null>;
}

export interface Slowdown {
  absolute: ConfidenceInterval;
  relative: ConfidenceInterval;
}

export function summaryStats(data: number[]): SummaryStats {
  const size = data.length;
  const sum = sumOf(data);
  const mean = sum / size;
  const squareResiduals = data.map((val) => (val - mean) ** 2);
  // n - 1 due to https://en.wikipedia.org/wiki/Bessel%27s_correction
  const variance = sumOf(squareResiduals) / (size - 1);
  const stdDev = Math.sqrt(variance);
  return {
    size,
    mean,
    meanCI: confidenceInterval95(
        samplingDistributionOfTheMean({mean, variance}, size), size),
    variance,
    standardDeviation: stdDev,
    // aka coefficient of variation
    relativeStandardDeviation: stdDev / mean,
  };
}

/**
 * Compute a 95% confidence interval for the given distribution.
 */
function confidenceInterval95(
    {mean, variance}: Distribution, size: number): ConfidenceInterval {
  // http://www.stat.yale.edu/Courses/1997-98/101/confint.htm
  const t = jstat.studentt.inv(1 - (.05 / 2), size - 1);
  const stdDev = Math.sqrt(variance);
  const margin = t * stdDev;
  return {
    low: mean - margin,
    high: mean + margin,
  };
}

/**
 * Return whether the given confidence interval contains a value.
 */
export function intervalContains(
    interval: ConfidenceInterval, value: number): boolean {
  return value >= interval.low && value <= interval.high;
}

export interface Horizons {
  absolute: number[];
  relative: number[];
}

/**
 * Return whether all difference confidence intervals are unambiguously located
 * on one side or the other of all given horizon values.
 *
 * For example, given the horizons 0 and 1:
 *
 *    <--->                   true
 *        <--->               false
 *            <--->           true
 *                <--->       false
 *                    <--->   true
 *        <----------->       false
 *
 *  |-------|-------|-------| ms slowdown
 * -1       0       1       2
 */
export function horizonsResolved(
    resultStats: ResultStats[], horizons: Horizons): boolean {
  for (const {differences} of resultStats) {
    if (differences === undefined) {
      continue;
    }
    // TODO We may want to offer more control over which particular set of
    // differences we care about resolving. For the moment, a horizon of 1%
    // means we'll try to resolve a 1% difference pairwise in both directions.
    for (const diff of differences) {
      if (diff === null) {
        continue;
      }
      for (const horizon of horizons.absolute) {
        if (intervalContains(diff.absolute, horizon)) {
          return false;
        }
      }
      for (const horizon of horizons.relative) {
        if (intervalContains(diff.relative, horizon)) {
          return false;
        }
      }
    }
  }
  return true;
}

function sumOf(data: number[]): number {
  return data.reduce((acc, cur) => acc + cur);
}

/**
 * Returns the benchmark result with the lowest mean duration.
 */
export function findFastest(stats: ResultStats[]): ResultStats {
  return stats.reduce((a, b) => a.stats.mean < b.stats.mean ? a : b);
}

/**
 * Returns the benchmark result with the highest mean duration.
 */
export function findSlowest(stats: ResultStats[]): ResultStats {
  return stats.reduce((a, b) => a.stats.mean > b.stats.mean ? a : b);
}

/**
 * Given an array of results and a baseline for comparison, return a new array
 * of results where each result (apart from the baseline itself) has additional
 * statistics describing how much slower it is than the baseline.
 */
export function computeSlowdowns(stats: ResultStats[]): ResultStats[] {
  return stats.map((result) => {
    return {
      ...result,
      differences:
          computeDifferences(stats.map((stat) => stat.stats), result.stats),
    };
  });
}

function computeDifferences(
    stats: SummaryStats[], baseline: SummaryStats): Array<Slowdown|null> {
  return stats.map(
      (stat) => stat === baseline ? null : computeSlowdown(stat, baseline));
}

export function computeSlowdown(a: SummaryStats, b: SummaryStats): Slowdown {
  const meanA = samplingDistributionOfTheMean(a, a.size);
  const meanB = samplingDistributionOfTheMean(b, b.size);
  const diffAbs = samplingDistributionOfAbsoluteDifferenceOfMeans(meanA, meanB);
  const diffRel = samplingDistributionOfRelativeDifferenceOfMeans(meanA, meanB);
  // We're assuming sample sizes are equal. If they're not for some reason, be
  // conservative and use the smaller one for the t-distribution's degrees of
  // freedom (since that will lead to a wider confidence interval).
  const minSize = Math.min(a.size, b.size);
  return {
    absolute: confidenceInterval95(diffAbs, minSize),
    relative: confidenceInterval95(diffRel, minSize),
  };
}

/**
 * Estimates the sampling distribution of the mean. This models the distribution
 * of the means that we would compute under repeated samples of the given size.
 */
function samplingDistributionOfTheMean(
    dist: Distribution, sampleSize: number): Distribution {
  // http://onlinestatbook.com/2/sampling_distributions/samp_dist_mean.html
  // http://www.stat.yale.edu/Courses/1997-98/101/sampmn.htm
  return {
    mean: dist.mean,
    // Error shrinks as sample size grows.
    variance: dist.variance / sampleSize,
  };
}

/**
 * Estimates the sampling distribution of the difference of means (b-a). This
 * models the distribution of the difference between two means that we would
 * compute under repeated samples under the given two sampling distributions of
 * means.
 */
function samplingDistributionOfAbsoluteDifferenceOfMeans(
    a: Distribution, b: Distribution): Distribution {
  // http://onlinestatbook.com/2/sampling_distributions/samplingdist_diff_means.html
  // http://www.stat.yale.edu/Courses/1997-98/101/meancomp.htm
  return {
    mean: b.mean - a.mean,
    // The error from both input sampling distributions of means accumulate.
    variance: a.variance + b.variance,
  };
}

/**
 * Estimates the sampling distribution of the relative difference of means
 * ((b-a)/a). This models the distribution of the relative difference between
 * two means that we would compute under repeated samples under the given two
 * sampling distributions of means.
 */
function samplingDistributionOfRelativeDifferenceOfMeans(
    a: Distribution, b: Distribution): Distribution {
  // http://blog.analytics-toolkit.com/2018/confidence-intervals-p-values-percent-change-relative-difference/
  // Note that the above article also prevents an alternative calculation for a
  // confidence interval for relative differences, but the one chosen here is
  // is much simpler and passes our stochastic tests, so it seems sufficient.
  return {
    mean: (b.mean - a.mean) / a.mean,
    variance:
        (a.variance * b.mean ** 2 + b.variance * a.mean ** 2) / a.mean ** 4,
  };
}
