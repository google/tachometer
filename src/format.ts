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

import stripAnsi from 'strip-ansi';
import * as table from 'table';

import ansi = require('ansi-escape-sequences');

import {Difference, ConfidenceInterval, ResultStats, ResultStatsWithDifferences} from './stats';
import {BenchmarkResult} from './types';

export const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'].map(
    (frame) => ansi.format(`[blue]{${frame}}`));

/**
 * An abstraction for the various dimensions of data we display.
 */
interface Dimension {
  label: string;
  format: (r: ResultStats) => string;
  tableConfig?: table.ColumnConfig;
}

export interface ResultTable {
  dimensions: Dimension[];
  results: ResultStats[];
}

/**
 * Create a manual mode result table.
 */
export function manualResultTable(result: ResultStats): ResultTable {
  const dimensions = [
    benchmarkDimension,
    variantDimension,
    implementationDimension,
    versionDimension,
    browserDimension,
    bytesSentDimension,
    runtimePointEstimateDimension,
  ];
  return {dimensions, results: [result]};
}

export interface AutomaticResults {
  fixed: ResultTable;
  unfixed: ResultTable;
}

/**
 * Create an automatic mode result table.
 */
export function automaticResultTable(results: ResultStats[]): AutomaticResults {
  // Typically most dimensions for a set of results share the same value (e.g
  // because we're only running one benchmark, one browser, etc.). To save
  // horizontal space and make the results easier to read, we first show the
  // fixed values in one table, then the unfixed values in another.
  const fixed: Dimension[] = [];
  const unfixed: Dimension[] = [];

  const possiblyFixed = [
    benchmarkDimension,
    variantDimension,
    implementationDimension,
    versionDimension,
    browserDimension,
    sampleSizeDimension,
    bytesSentDimension,
  ];

  for (const dimension of possiblyFixed) {
    const values = new Set<string>();
    for (const res of results) {
      values.add(dimension.format(res));
    }
    if (values.size === 1) {
      fixed.push(dimension);
    } else {
      unfixed.push(dimension);
    }
  }

  // These are the primary observed results, so they always go in the main
  // result table, even if they happen to be the same in one run.
  unfixed.push(
      runtimeConfidenceIntervalDimension,
  );
  if (results.length > 1) {
    // Create an NxN matrix comparing every result to every other result.
    const labelFn = makeUniqueLabelFn(results.map((result) => result.result));
    for (let i = 0; i < results.length; i++) {
      unfixed.push({
        label: `vs ${labelFn(results[i].result)}`,
        tableConfig: {
          alignment: 'right',
        },
        format: (r: ResultStats&Partial<ResultStatsWithDifferences>) => {
          if (r.differences === undefined) {
            return '';
          }
          const diff = r.differences[i];
          if (diff === null) {
            return '\n-       ';
          }
          return formatDifference(diff);
        },
      });
    }
  }

  const fixedTable = {dimensions: fixed, results: [results[0]]};
  const unfixedTable = {dimensions: unfixed, results};
  return {fixed: fixedTable, unfixed: unfixedTable};
}

/**
 * Format a terminal text result table where each result is a row:
 *
 * +--------+--------+
 * | Header | Header |
 * +--------+--------+
 * | Value  | Value  |
 * +--------+--------+
 * | Value  | Value  |
 * +--------+--------+
 */
export function verticalTermResultTable({dimensions, results}: ResultTable):
    string {
  const columns = dimensions.map((d) => d.tableConfig || {});
  const rows = [
    dimensions.map((d) => ansi.format(`[bold]{${d.label}}`)),
    ...results.map((r) => dimensions.map((d) => d.format(r))),
  ];
  return table.table(rows, {
    border: table.getBorderCharacters('norc'),
    columns,
  });
}

/**
 * Format a terminal text result table where each result is a column:
 *
 * +--------+-------+-------+
 * | Header | Value | Value |
 * +--------+-------+-------+
 * | Header | Value | Value |
 * +--------+-------+-------+
 */
export function horizontalTermResultTable({dimensions, results}: ResultTable):
    string {
  const columns: table.ColumnConfig[] = [
    {alignment: 'right'},
    ...results.map((): table.ColumnConfig => ({alignment: 'left'})),
  ];
  const rows = dimensions.map((d) => {
    return [
      ansi.format(`[bold]{${d.label}}`),
      ...results.map((r) => d.format(r)),
    ];
  });
  return table.table(rows, {
    border: table.getBorderCharacters('norc'),
    columns,
  });
}

/**
 * Format an HTML result table where each result is a row:
 *
 * <table>
 *   <tr> <th>Header</th> <th>Header</th> </tr>
 *   <tr> <td>Value</td> <td>Value</td> </tr>
 *   <tr> <td>Value</td> <td>Value</td> </tr>
 * </table>
 */
export function verticalHtmlResultTable({dimensions, results}: ResultTable):
    string {
  const headers = dimensions.map((d) => `<th>${d.label}</th>`);
  const rows = [];
  for (const r of results) {
    const cells =
        dimensions.map((d) => `<td>${ansiCellToHtml(d.format(r))}</td>`);
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table>
    <tr>${headers.join('')}</tr>
    ${rows.join('')}
  </table>`;
}

/**
 * Format an HTML result table where each result is a column:
 *
 * <table>
 *   <tr> <th>Header</th> <td>Value</td> <td>Value</td> </tr>
 *   <tr> <th>Header</th> <td>Value</td> <td>Value</td> </tr>
 * </table>
 */
export function horizontalHtmlResultTable({dimensions, results}: ResultTable):
    string {
  const rows: string[] = [];
  for (const d of dimensions) {
    const cells = [
      `<th align="right">${d.label}</th>`,
      ...results.map((r) => `<td>${ansiCellToHtml(d.format(r))}</td>`),
    ];
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table>${rows.join('')}</table>`;
}

function ansiCellToHtml(ansi: string): string {
  // For now, just remove ANSI color sequences and prevent line-breaks. We may
  // want to add an htmlFormat method to each dimension object so that we can
  // have more advanced control per dimension.
  return stripAnsi(ansi).replace(/ /g, '&nbsp;');
}

/**
 * Format a confidence interval as "[low, high]".
 */
const formatConfidenceInterval =
    (ci: ConfidenceInterval, format: (n: number) => string) => {
      return ansi.format(`${format(ci.low)} [gray]{-} ${format(ci.high)}`);
    };

/**
 * Prefix positive numbers with a red "+" and negative ones with a green "-".
 */
const colorizeSign = (n: number, format: (n: number) => string) => {
  if (n > 0) {
    return ansi.format(`[red bold]{+}${format(n)}`);
  } else if (n < 0) {
    // Negate the value so that we don't get a double negative sign.
    return ansi.format(`[green bold]{-}${format(-n)}`);
  } else {
    return format(n);
  }
};

const benchmarkDimension: Dimension = {
  label: 'Benchmark',
  format: (r: ResultStats) => r.result.name,
};

const variantDimension: Dimension = {
  label: 'Variant',
  tableConfig: {
    alignment: 'right',
  },
  format: (r: ResultStats) => r.result.variant,
};

const implementationDimension: Dimension = {
  label: 'Impl',
  format: (r: ResultStats) => r.result.implementation,
};

const versionDimension: Dimension = {
  label: 'Version',
  format: (r: ResultStats) => r.result.version,
};

const browserDimension: Dimension = {
  label: 'Browser',
  format: (r: ResultStats) =>
      `${r.result.browser.name}\n${r.result.browser.version}`,
};

const sampleSizeDimension: Dimension = {
  label: 'Sample size',
  format: (r: ResultStats) => r.result.millis.length.toString(),
};

const bytesSentDimension: Dimension = {
  label: 'Bytes',
  format: (r: ResultStats) => (r.result.bytesSent / 1024).toFixed(2) + ' KiB',
};

const runtimeConfidenceIntervalDimension: Dimension = {
  label: 'Avg time',
  tableConfig: {
    alignment: 'right',
  },
  format: (r: ResultStats) =>
      formatConfidenceInterval(r.stats.meanCI, (n) => n.toFixed(1) + 'ms'),
};

const runtimePointEstimateDimension: Dimension = {
  label: 'Runtime',
  format: (r: ResultStats) =>
      ansi.format(`[blue]{${r.stats.mean.toFixed(3)}} ms`),
};

function formatDifference({absolute, relative}: Difference): string {
  let word, rel, abs;
  if (absolute.low > 0 && relative.low > 0) {
    word = `[bold red]{slower}`;
    rel = `${percent(relative.low)}% [gray]{-} ${percent(relative.high)}%`;
    abs =
        `${absolute.low.toFixed(1)}ms [gray]{-} ${absolute.high.toFixed(1)}ms`;

  } else if (absolute.high < 0 && relative.low < 0) {
    word = `[bold green]{faster}`;
    rel = `${percent(-relative.high)}% [gray]{-} ${percent(-relative.low)}%`;
    abs = `${- absolute.high.toFixed(1)}ms [gray]{-} ${
        - absolute.low.toFixed(1)}ms`;

  } else {
    word = `[bold blue]{unsure}`;
    rel = `${colorizeSign(relative.low, (n) => percent(n))}% [gray]{-} ${
        colorizeSign(relative.high, (n) => percent(n))}%`;
    abs = `${colorizeSign(absolute.low, (n) => n.toFixed(1))}ms [gray]{-} ${
        colorizeSign(absolute.high, (n) => n.toFixed(1))}ms`;
  }
  return ansi.format(`${word}\n${rel}\n${abs}`);
}

function percent(n: number): string {
  return (n * 100).toFixed(0);
}

/**
 * Create a function that will return the shortest unambiguous label for a
 * result, given the full array of results.
 */
function makeUniqueLabelFn(results: BenchmarkResult[]):
    (result: BenchmarkResult) => string {
  const names = new Set();
  const variants = new Set();
  const implementations = new Set();
  const versions = new Set();
  const browsers = new Set();
  for (const result of results) {
    names.add(result.name);
    variants.add(result.variant);
    implementations.add(result.implementation);
    versions.add(result.version);
    browsers.add(result.browser.name);
  }
  return (result: BenchmarkResult) => {
    const fields = [];
    if (names.size > 1) {
      fields.push(result.name);
    }
    if (variants.size > 1) {
      fields.push(result.variant);
    }
    if (implementations.size > 1) {
      fields.push(result.implementation);
    }
    if (versions.size > 1) {
      fields.push(result.version);
    }
    if (browsers.size > 1) {
      fields.push(result.browser.name);
    }
    return fields.join('\n');
  };
}
