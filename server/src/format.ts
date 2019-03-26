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

import * as table from 'table';
import ansi = require('ansi-escape-sequences');

import {BenchmarkResult} from './types';
import {summaryStats} from './stats';

/**
 * The formatted headers of our ASCII results table.
 */
export const tableHeaders = [
  'Benchmark',       // 0
  'Implementation',  // 1
  'Browser',         // 2
  'Trials',          // 3
  'Stats',           // 4
].map((header) => ansi.format(`[bold]{${header}}`));

/**
 * The column configuration of our ASCII results table.
 */
export const tableColumns: {[key: string]: table.ColumnConfig} = {
  0: {
    width: 15,
  },
  1: {
    width: 15,
  },
  2: {
    width: 13,
  },
  3: {
    alignment: 'center',
    width: 6,
  },
  4: {
    width: 28,
  },
};

/**
 * Format a single row of our ASCII results table.
 */
export function formatResultRow(
    result: BenchmarkResult, paint: boolean): string[] {
  // TODO Don't compute stats here, this should be concerned only with
  // formatting.
  const stats =
      summaryStats(paint === true ? result.paintMillis : result.millis);
  return [
    result.name + (result.variant !== undefined ? `\n${result.variant}` : ''),
    `${result.implementation}\n${result.version}`,
    `${result.browser.name}\n${result.browser.version}`,
    stats.size.toFixed(0),
    [
      `  Mean ${stats.arithmeticMean.toFixed(2)} ` +
          `(±${stats.confidenceInterval95.toFixed(2)} @95)`,
      `StdDev ${stats.standardDeviation.toFixed(2)} ` +
          `(${(stats.relativeStandardDeviation * 100).toFixed(2)}%)`,
      ` Range ${(stats.min).toFixed(2)} - ${(stats.max).toFixed(2)}`,
    ].join('\n')
  ];
}
