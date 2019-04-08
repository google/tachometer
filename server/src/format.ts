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

import {ConfidenceInterval, ResultStats} from './stats';

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

/**
 * Format a manual mode result as an ASCII table.
 */
export function formatManualResult(result: ResultStats): string {
  const dimensions = [
    benchmarkDimension,
    variantDimension,
    implementationDimension,
    versionDimension,
    browserDimension,
    bytesSentDimension,
    runtimePointEstimateDimension,
  ];
  return verticalResultTable([result], dimensions);
}

/**
 * Format automatic mode results as ASCII tables.
 */
export function formatAutomaticResults(results: ResultStats[]): string {
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

  unfixed.push(
      // These are the primary observed results, so they always go in the main
      // result table, even if they happen to be the same in one run.
      runtimeConfidenceIntervalDimension,
      standardDeviationDimension,
      absoluteSlowdownDimension,
      relativeSlowdownDimension,
      directionDimension,
  );

  const fixedTable = horizontalResultTable([results[0]], fixed);
  const unfixedTable = verticalResultTable(results, unfixed);
  return `${fixedTable}\n${unfixedTable}\n`;
}

/**
 * Format a result table where each result is a row:
 *
 * +--------+--------+
 * | Header | Header |
 * +--------+--------+
 * | Value  | Value  |
 * +--------+--------+
 * | Value  | Value  |
 * +--------+--------+
 */
function verticalResultTable(
    results: ResultStats[], dimensions: Dimension[]): string {
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
 * Format a result table where each result is a column:
 *
 * +--------+-------+-------+
 * | Header | Value | Value |
 * +--------+-------+-------+
 * | Header | Value | Value |
 * +--------+-------+-------+
 */
function horizontalResultTable(
    results: ResultStats[], dimensions: Dimension[]): string {
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
 * Format a confidence interval as "[low, high]".
 */
const formatConfidenceInterval =
    (ci: ConfidenceInterval, format: (n: number) => string) => {
      return ansi.format(
          `[gray]{[}${format(ci.low)}[gray]{,} ` +
          `${format(ci.high)}[gray]{]}`);
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
      `${r.result.browser.name} ${r.result.browser.version}`,
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
  label: 'Runtime [95% CI]',
  tableConfig: {
    alignment: 'right',
  },
  format: (r: ResultStats) =>
      formatConfidenceInterval(r.stats.meanCI, (n) => n.toFixed(3) + 'ms'),
};

const runtimePointEstimateDimension: Dimension = {
  label: 'Runtime',
  format: (r: ResultStats) =>
      ansi.format(`[blue]{${r.stats.mean.toFixed(3)}} ms`),
};

const absoluteSlowdownDimension: Dimension = {
  label: 'Slowdown [95% CI]',
  tableConfig: {
    alignment: 'right',
  },
  format: (r: ResultStats) => {
    if (r.isBaseline === true || r.slowdown === undefined) {
      return ansi.format(`[gray]{N/A        }`);
    }
    return formatConfidenceInterval(
        r.slowdown.absolute,
        (n: number) => colorizeSign(n, (n) => n.toFixed(3)) + 'ms');
  },
};

const relativeSlowdownDimension: Dimension = {
  label: 'Relative [95% CI]',
  tableConfig: {
    alignment: 'right',
  },
  format: (r: ResultStats) => {
    if (r.isBaseline === true || r.slowdown === undefined) {
      return ansi.format(`[gray]{N/A        }`);
    }
    return formatConfidenceInterval(
        r.slowdown.relative,
        (n: number) => colorizeSign(n, (n) => (n * 100).toFixed(2) + '%'));
  },
};

const directionDimension: Dimension = {
  label: 'Direction',
  tableConfig: {
    alignment: 'center',
  },
  format: (r: ResultStats) => {
    if (r.isBaseline === true || r.slowdown === undefined) {
      return ansi.format(`[bold blue]{baseline}`);
    }
    if (r.slowdown.absolute.low > 0) {
      return ansi.format(`[bold red]{slower}`);
    } else if (r.slowdown.absolute.high < 0) {
      return ansi.format(`[bold green]{faster}`);
    } else {
      return ansi.format(`[bold gray]{unsure}`);
    }
  }
};

const standardDeviationDimension: Dimension = {
  label: 'StdDev (CV)',
  format: (r: ResultStats) => {
    const sd = r.stats.standardDeviation;
    const mean = r.stats.mean;
    return `${sd.toFixed(2)}ms (${(sd / mean * 100).toFixed()}%)`;
  }
};
