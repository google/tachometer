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

import * as csvStringify from 'csv-stringify/lib/sync';

import {ResultStatsWithDifferences} from './stats';

const precision = 5;

/**
 * Format results as a CSV file string.
 */
export function formatCsv(results: ResultStatsWithDifferences[]): string {
  // Note the examples in ./test/csv_test.ts should make this easier to
  // understand.
  const h1 = ['', '', ''];
  const h2 = ['', 'ms', ''];
  const h3 = ['', 'min', 'max'];
  const rows = [];
  for (const result of results) {
    h1.push(`vs ${result.result.name}`, '', '', '');
    h2.push('% change', '', 'ms change', '');
    h3.push('min', 'max', 'min', 'max');
    const row = [];
    row.push(
        result.result.name,
        result.stats.meanCI.low.toFixed(precision),
        result.stats.meanCI.high.toFixed(precision),
    );
    for (const diff of result.differences) {
      if (diff === null) {
        row.push('', '', '', '');
      } else {
        row.push(
            (diff.relative.low * 100).toFixed(precision) + '%',
            (diff.relative.high * 100).toFixed(precision) + '%',
            diff.absolute.low.toFixed(precision),
            diff.absolute.high.toFixed(precision),
        )
      }
    }
    rows.push(row);
  }
  return csvStringify([h1, h2, h3, ...rows]);
}
