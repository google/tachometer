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

export interface SummaryStats {
  size: number;
  min: number;
  max: number;
  arithmeticMean: number;
  standardDeviation: number;
  confidenceInterval95: number;
}

export function summaryStats(data: number[]): SummaryStats {
  const size = data.length;
  const sum = sumOf(data);
  const arithMean = sum / size;
  const squareResiduals = data.map((val) => (val - arithMean) ** 2);
  // TODO Should we use Bessel's correction (n-1)?
  const variance = sumOf(squareResiduals) / size;
  const stdDev = Math.sqrt(variance);
  return {
    size: size,
    min: Math.min(...data),
    max: Math.max(...data),
    arithmeticMean: arithMean,
    standardDeviation: stdDev,
    // TODO Should we use the t distribution instead of the standard normal
    // distribution?
    confidenceInterval95: z95 * (stdDev / Math.sqrt(size)),
  };
}

const z95 = 1.96;

function sumOf(data: number[]): number {
  return data.reduce((acc, cur) => acc + cur);
}
