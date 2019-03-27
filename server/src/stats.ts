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

// TODO Since we are estimating variance, we should probably use the student's
// t-distribution instead of the normal distribution, for more sound results.

import {BenchmarkResult} from './types';

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
  slowdown?: ConfidenceInterval;
  isBaseline?: boolean;
}

export function summaryStats(data: number[]): SummaryStats {
  const size = data.length;
  const sum = sumOf(data);
  const mean = sum / size;
  const squareResiduals = data.map((val) => (val - mean) ** 2);
  const variance = sumOf(squareResiduals) / size;
  const stdDev = Math.sqrt(variance);
  return {
    size,
    mean,
    meanCI: confidenceInterval95(
        samplingDistributionOfTheMean({mean, variance}, size)),
    variance,
    standardDeviation: stdDev,
    // aka coefficient of variation
    relativeStandardDeviation: stdDev / mean,
  };
}

// The z-value for a 95% confidence interval. On a normal distribution, 95% of
// values lie within the area bounded by [-z95, z95] standard deviations from
// the mean.
//
// http://onlinestatbook.com/2/normal_distribution/areas_normal.html
// https://homepage.stat.uiowa.edu/~mbognar/applets/normal.html
const z95 = 1.96;

/**
 * Compute a 95% confidence interval for the given distribution.
 */
function confidenceInterval95({mean, variance}: Distribution):
    ConfidenceInterval {
  // http://www.stat.yale.edu/Courses/1997-98/101/confint.htm
  const stdDev = Math.sqrt(variance);
  const margin = z95 * stdDev;
  return {
    low: mean - margin,
    high: mean + margin,
  };
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
 * Given an array of results and a baseline for comparison, return a new array
 * of results where each result (apart from the baseline itself) has additional
 * statistics describing how much slower it is than the baseline.
 */
export function computeSlowdowns(
    stats: ResultStats[], baseline: ResultStats): ResultStats[] {
  const baselineSDM =
      samplingDistributionOfTheMean(baseline.stats, baseline.stats.size);
  return stats.map((result) => {
    if (result === baseline) {
      // No slowdown for the baseline.
      return result;
    }
    const sdm = samplingDistributionOfTheMean(result.stats, result.stats.size);
    const sddm = samplingDistributionOfTheDifferenceOfMeans(sdm, baselineSDM);
    return {
      ...result,
      slowdown: confidenceInterval95(sddm),
    };
  });
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
 * Estimates the sampling distribution of the difference of means. This models
 * the distribution of the difference between two means that we would compute
 * under repeated samples under the given two sampling distributions of means.
 */
function samplingDistributionOfTheDifferenceOfMeans(
    a: Distribution, b: Distribution): Distribution {
  // http://onlinestatbook.com/2/sampling_distributions/samplingdist_diff_means.html
  // http://www.stat.yale.edu/Courses/1997-98/101/meancomp.htm
  return {
    mean: a.mean - b.mean,
    // The error from both input sampling distributions of means accumulate.
    variance: a.variance + b.variance,
  };
}
