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
  'Samples',               // 3
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
    width: 14,
  },
  3: {
    alignment: 'center',
    width: 7,
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
    const ci = 'Δ [' + (slowdown.ci.low >= 0 ? '+' : '') +
        slowdown.ci.low.toFixed(2) + ', ' + (slowdown.ci.high >= 0 ? '+' : '') +
        slowdown.ci.high.toFixed(2) + ']';

    if (slowdown.rejectNullHypothesis === true) {
      if (slowdown.ci.low + slowdown.ci.high > 0) {
        slowdownColumn +=
            ansi.format(`     [bold white bg-red]{ LIKELY SLOWER }`);
      } else {
        slowdownColumn +=
            ansi.format(`     [bold white bg-green]{ LIKELY FASTER }`);
      }
      slowdownColumn += '\n';
      slowdownColumn += ci;
      slowdownColumn += `\np ${percent(slowdown.pValue, 2)}`;

    } else {
      const power = slowdown.powerAnalysis;
      slowdownColumn +=
          ansi.format(`  [bold white bg-gray]{ INDISTINGUISHABLE }`);
      slowdownColumn += '\n';
      slowdownColumn += ci;
      slowdownColumn += `\np ${percent(slowdown.pValue, 2)}`;
      slowdownColumn += `\n${percent(power.observedPower)} power ` +
          `| Δ${power.hypothesizedAbsoluteEffect.toFixed(2)}ms`;
      if (power.observedPower < power.desiredPower) {
        slowdownColumn += `\nTry n = ${power.minimumSampleSize}`;
      }
    }
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
          `(${percent(stats.relativeStandardDeviation, 2)})`,
    ].join('\n'),
    slowdownColumn,
    `${(result.bytesSent / 1024).toFixed(2)} KiB`,
  ];
}

function percent(n: number, digits: number = 0): string {
  return (n * 100).toFixed(digits) + '%';
}

export const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'].map(
    (frame) => ansi.format(`[blue]{${frame}}`));
