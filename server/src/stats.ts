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
  slowdown?: Slowdown;
  isBaseline?: boolean;
}

export interface Slowdown {
  ci: ConfidenceInterval;
  rejectNullHypothesis: boolean;
  pValue: number;
  powerAnalysis: PowerAnalysis;
}

interface PowerAnalysis {
  hypothesizedAbsoluteEffect: number;
  desiredPower: number;
  observedPower: number;
  minimumSampleSize: number;
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

    // We're assuming sample sizes are equal. If they're not for some reason, be
    // conservative and use the smaller one (since the sampling distribution
    // will most likely have higher variance).
    const size = Math.min(baseline.stats.size, result.stats.size);

    const sdm = samplingDistributionOfTheMean(result.stats, size);
    const sddm = samplingDistributionOfTheDifferenceOfMeans(sdm, baselineSDM);

    // Here we perform a 2-sided t-test with a null hypothesis that the two
    // means are equal.
    // https://en.wikipedia.org/wiki/Student%27s_t-test

    // Convert the (signed) difference in means we observed into standard
    // errors.
    // https://en.wikipedia.org/wiki/T-statistic
    const tStatistic = sddm.mean / Math.sqrt(sddm.variance);

    // Compute the probability that we could observe a difference in means as
    // extreme as this one (in either direction), if we assumed that the null
    // hypothesis was true.
    // https://en.wikipedia.org/wiki/P-value
    const pValue = jstat.studentt.cdf(-Math.abs(tStatistic), size - 1);

    // Reject if the probability of observing a value as extreme as this one is
    // below our chosen significance level (aka Type I error rate, aka alpha,
    // aka 1 - chosen confidence level).
    // https://en.wikipedia.org/wiki/Type_I_and_type_II_errors#Type_I_error
    const significanceLevel = 0.05;
    const rejectNullHypothesis = pValue < significanceLevel;

    // We are also interested in our potential Type II error rates (aka beta);
    // the probability of failing to reject the null hypothesis if it was in
    // fact false. This rate is defined only for given specific hypothesized
    // differences (called effect size), since it is easier to detect large
    // differences than small ones. See https://rpsychologist.com/d3/NHST/ for a
    // visualization of power analysis.

    // TODO Make this a flag. The difference we might care about detecting about
    // varies by case.
    const hypothesizedAbsoluteEffect = 0.01;

    // 80% power is a common value. Could be a flag.
    const desiredPower = 0.8;

    // TODO It seems possible that two different programs would have different
    // variance, so the pooled variance isn't neccessarily what we want to use.
    // Is there another way of computing power that takes this into account?
    const pooledVariance = poolVariances(baseline.stats, result.stats);
    const pooledStdDev = Math.sqrt(pooledVariance);

    // Convert our effect of interest into units of standard deviation.
    const hypothesizedStandardEffect =
        hypothesizedAbsoluteEffect / pooledStdDev;

    // http://statweb.stanford.edu/~susan/courses/s141/hopower.pdf
    const tAlpha = jstat.studentt.inv(1 - (significanceLevel / 2), size - 1);
    const observedPower =
        jstat.studentt.cdf(
            (Math.sqrt(size) * hypothesizedStandardEffect) - tAlpha, size - 1) +
        jstat.studentt.cdf(
            (-Math.sqrt(size) * hypothesizedStandardEffect) - tAlpha, size - 1);

    // See "Sample Sizes for Two Independent Samples, Continuous Outcome" from
    // http://sphweb.bumc.bu.edu/otlt/MPH-Modules/BS/BS704_Power/BS704_Power_print.html
    const tBeta = jstat.studentt.inv(desiredPower, size - 1);
    const minimumSampleSize =
        Math.ceil(2 * (((tAlpha + tBeta) / hypothesizedStandardEffect) ** 2));

    return {
      ...result,
      slowdown: {
        ci: confidenceInterval95(sddm, size),
        rejectNullHypothesis,
        pValue,
        powerAnalysis: {
          hypothesizedAbsoluteEffect,
          desiredPower,
          observedPower,
          minimumSampleSize,
        },
      },
    };
  });
}

/**
 * If we assume that the two populations have equal variance, then the pooled
 * (average, weighted by sample size) variance is a better estimate of that
 * variance than either of the individual estimates.
 * https://en.wikipedia.org/wiki/Pooled_variance
 */
function poolVariances(...stats: SummaryStats[]): number {
  return sumOf(stats.map((s) => (s.size - 1) * s.variance)) /
      sumOf(stats.map((s) => s.size - 1));
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
