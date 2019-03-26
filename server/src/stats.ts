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
  min: number;
  max: number;
  mean: number;
  meanCI: ConfidenceInterval;
  standardDeviation: number;
  relativeStandardDeviation: number;
}

export interface ResultStats {
  result: BenchmarkResult;
  stats: SummaryStats;
  slowdown?: ConfidenceInterval;
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
    min: Math.min(...data),
    max: Math.max(...data),
    mean,
    meanCI: {
      low: mean - meanMargin,
      high: mean + meanMargin,
    },
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
  return stats.map((result) => {
    if (result === baseline) {
      return {
        ...result,
        slowdown: {low: 0, high: 0},
      };
    }
    return {
      ...result,
      slowdown: {low: 1, high: 1},
    };
  });
}
