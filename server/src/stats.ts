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
  // TODO Should we use Bessel's correction (n-1)?
  const variance = sumOf(squareResiduals) / size;
  const stdDev = Math.sqrt(variance);
  const meanMargin = z95 * (stdDev / Math.sqrt(size));
  return {
    size,
    mean,
    meanCI: {
      low: mean - meanMargin,
      high: mean + meanMargin,
    },
    variance,
    standardDeviation: stdDev,
    // aka coefficient of variation
    relativeStandardDeviation: stdDev / mean,
    // TODO Should we use the t distribution instead of the standard normal
    // distribution?
  };
}

const z95 = 1.96;

function sumOf(data: number[]): number {
  return data.reduce((acc, cur) => acc + cur);
}

export function findFastest(stats: ResultStats[]): ResultStats {
  return stats.reduce((a, b) => a.stats.mean < b.stats.mean ? a : b);
}

export function computeSlowdowns(
    stats: ResultStats[], baseline: ResultStats): ResultStats[] {
  const baselineSDM = samplingDistributionOfTheMean(baseline.stats);
  return stats.map((result) => {
    if (result === baseline) {
      return {
        ...result,
        slowdown: {low: 0, high: 0},
      };
    }

    const resultSDM = samplingDistributionOfTheMean(result.stats);
    const sddm =
        samplingDistributionOfTheDifferenceOfMeans(resultSDM, baselineSDM);
    const sddmCI = confidenceInterval(sddm);
    return {
      ...result,
      slowdown: sddmCI,
    };
  });
}

function confidenceInterval({mean, variance}: Distribution):
    ConfidenceInterval {
  const margin = z95 * Math.sqrt(variance);
  return {
    low: mean - margin,
    high: mean + margin,
  };
}

interface Distribution {
  mean: number;
  variance: number;
}

function samplingDistributionOfTheMean(stats: SummaryStats): Distribution {
  return {
    mean: stats.mean,
    variance: stats.variance / stats.size,
  };
}

function samplingDistributionOfTheDifferenceOfMeans(
    a: Distribution, b: Distribution): Distribution {
  return {
    mean: a.mean - b.mean,
    variance: a.variance + b.variance,
  };
}
