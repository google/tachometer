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

import {ResultStats} from './stats';

/**
 * The formatted headers of our ASCII results table.
 */
export const tableHeaders = [
  'Benchmark',             // 0
  'Implementation',        // 1
  'Browser',               // 2
  'Trials',                // 3
  'Duration (ms) C=0.95',  // 4
  'Slowdown (ms) C=0.95',  // 5
  'Bytes sent',            // 6
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
  5: {
    width: 23,
  },
  6: {
    width: 10,
  },
};

/**
 * Format a single row of our ASCII results table.
 */
export function formatResultRow(
    {result, stats, slowdown, isBaseline}: ResultStats): string[] {
  let slowdownColumn = '';
  if (isBaseline) {
    slowdownColumn = ansi.format(`       [bold white bg-blue]{ BASELINE }`);
  } else if (slowdown !== undefined) {
    slowdownColumn = '[' + (slowdown.low >= 0 ? '+' : '') +
        slowdown.low.toFixed(2) + ', ' + (slowdown.high >= 0 ? '+' : '') +
        slowdown.high.toFixed(2) + ']';
  }
  return [
    result.name + (result.variant !== undefined ? `\n${result.variant}` : ''),
    `${result.implementation}\n${result.version}`,
    `${result.browser.name}\n${result.browser.version}`,
    stats.size.toFixed(0),
    [
      `  Mean [${stats.meanCI.low.toFixed(2)}, ` +
          `${stats.meanCI.high.toFixed(2)}]`,
      `StdDev ${stats.standardDeviation.toFixed(2)} ` +
          `(${(stats.relativeStandardDeviation * 100).toFixed(2)}%)`,
    ].join('\n'),
    slowdownColumn,
    `${(result.bytesSent / 1024).toFixed(2)} KiB`,
  ];
}

//
