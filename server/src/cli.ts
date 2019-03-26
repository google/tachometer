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

require('source-map-support').install();

import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as table from 'table';

import commandLineArgs = require('command-line-args');
import commandLineUsage = require('command-line-usage');
import ProgressBar = require('progress');

import {makeSession} from './session';
import {makeDriver, openAndSwitchToNewTab, getPaintTime} from './browser';
import {BenchmarkResult, BenchmarkSpec} from './types';
import {Server} from './server';
import {summaryStats, findFastest, computeSlowdowns} from './stats';
import {specsFromOpts} from './specs';
import {tableHeaders, tableColumns, formatResultRow} from './format';
import {prepareVersionDirectories} from './versions';

const repoRoot = path.resolve(__dirname, '..', '..');

const validBrowsers = new Set([
  'chrome',
  'firefox',
]);

const optDefs: commandLineUsage.OptionDefinition[] = [
  {
    name: 'help',
    description: 'Show documentation',
    type: Boolean,
    defaultValue: false,
  },
  {
    name: 'host',
    description: 'Which host to run on',
    type: String,
    defaultValue: '127.0.0.1',
  },
  {
    name: 'port',
    description: 'Which port to run on (0 for random free)',
    type: Number,
    defaultValue: '0',
  },
  {
    name: 'name',
    description: 'Which benchmarks to run (* for all)',
    alias: 'n',
    type: String,
    defaultValue: '*',
  },
  {
    name: 'implementation',
    description: 'Which implementations to run (* for all)',
    alias: 'i',
    type: String,
    defaultValue: 'lit-html',
  },
  {
    name: 'variant',
    description: 'Which variant to run (* for all)',
    alias: 'v',
    type: String,
    defaultValue: '*',
  },
  {
    name: 'package-version',
    description: 'Specify one or more dependency versions (see README)',
    alias: 'p',
    type: String,
    defaultValue: [],
    lazyMultiple: true,
  },
  {
    name: 'browser',
    description: 'Which browsers to launch in automatic mode, ' +
        `comma-delimited (${[...validBrowsers].join(' ,')})`,
    alias: 'b',
    type: String,
    defaultValue: 'chrome',
  },
  {
    name: 'trials',
    description: 'How many times to run each benchmark',
    alias: 't',
    type: Number,
    defaultValue: 10,
  },
  {
    name: 'manual',
    description: 'Don\'t run automatically, just show URLs and collect results',
    alias: 'm',
    type: Boolean,
    defaultValue: false,
  },
  {
    name: 'save',
    description: 'Save benchmark JSON data to this file',
    alias: 's',
    type: String,
    defaultValue: '',
  },
  {
    name: 'paint',
    description: 'Include next paint in measured interval',
    type: Boolean,
    defaultValue: false,
  },
];

interface Opts {
  help: boolean;
  host: string;
  port: number;
  name: string;
  implementation: string;
  variant: string;
  'package-version': string[];
  browser: string;
  trials: number;
  manual: boolean;
  save: string;
  paint: boolean;
}

function combineResults(results: BenchmarkResult[]): BenchmarkResult {
  const combined: BenchmarkResult = {
    ...results[0],
    millis: [],
  };
  for (const result of results) {
    combined.millis.push(...result.millis);
    combined.paintMillis.push(...result.paintMillis);
  }
  return combined;
}

async function main() {
  const opts = commandLineArgs(optDefs) as Opts;
  if (opts.help) {
    console.log(commandLineUsage([{
      header: 'lit-benchmarks-runner',
      optionList: optDefs,
    }]));
    return;
  }

  if (opts.trials <= 0) {
    throw new Error('--trials must be > 0');
  }

  const specs = await specsFromOpts(repoRoot, opts);
  if (specs.length === 0) {
    throw new Error('No benchmarks matched with the given flags');
  }

  await prepareVersionDirectories(repoRoot, specs);

  const server = await Server.start({
    host: opts.host,
    port: opts.port,
    rootDir: repoRoot,
  });

  if (opts.manual === true) {
    await manualMode(opts, specs, server);
  } else {
    await automaticMode(opts, specs, server);
  }
}

/**
 * Let the user run benchmarks manually. This process will not exit until the
 * user sends a termination signal.
 */
async function manualMode(opts: Opts, specs: BenchmarkSpec[], server: Server) {
  if (opts.save) {
    throw new Error(`Can't save results in manual mode`);
  }

  const urlTable: string[][] = [];
  for (const spec of specs) {
    urlTable.push([
      spec.name,
      spec.implementation,
      server.specUrl(spec),
    ]);
  }
  console.log();
  console.log('Visit these URLs in any browser:');
  console.log();
  console.log(table.table(urlTable));

  console.log('Results will appear below:');
  console.log();
  const stream = table.createStream({
    columnCount: tableHeaders.length,
    columns: tableColumns,
    columnDefault: {
      width: 18,
    },
  });
  // TODO(aomarks) Upstream this type to DT, it's wrong.
  const streamWrite = stream.write as unknown as (cols: string[]) => void;
  streamWrite(tableHeaders);
  (async function() {
    for await (const result of server.streamResults()) {
      streamWrite(
          formatResultRow({result, stats: summaryStats(result.millis)}));
    }
  })();
}

async function automaticMode(
    opts: Opts, specs: BenchmarkSpec[], server: Server) {
  const browsers = new Set(
      opts.browser.replace(/\s+/, '').split(',').filter((b) => b !== ''));
  if (browsers.size === 0) {
    throw new Error('At least one --browser must be specified');
  }
  for (const b of browsers) {
    if (validBrowsers.has(b) === false) {
      throw new Error(`Unknown --browser '${b}'`);
    }
  }

  console.log('Running benchmarks\n');

  const bar = new ProgressBar('[:bar] :status', {
    total: browsers.size * specs.length * opts.trials,
    width: 58,
  });

  const specResults = new Map<BenchmarkSpec, BenchmarkResult[]>();
  for (const spec of specs) {
    specResults.set(spec, []);
  }

  const numRuns = browsers.size * specs.length * opts.trials;
  let r = 0;

  for (const browser of browsers) {
    bar.tick(0, {status: `launching ${browser}`});

    // It's important that we execute each benchmark iteration in a new tab.
    // At least in Chrome, each tab corresponds to process which shares some
    // amount of cached V8 state which can cause significant measurement
    // effects. There might even be additional interaction effects that would
    // require an entirely new browser to remove, but experience in Chrome so
    // far shows that new tabs are neccessary and sufficient.
    const driver = await makeDriver(browser, opts);
    const tabs = await driver.getAllWindowHandles();
    // We'll always launch new tabs from this initial blank tab.
    const initialTabHandle = tabs[0];

    for (let t = 0; t < opts.trials; t++) {
      for (const spec of specs) {
        const run = server.runBenchmark(spec);
        bar.tick(0, {
          status: [
            `${++r}/${numRuns}`,
            browser,
            spec.name,
            spec.variant,
            `${spec.implementation}@${spec.version.label}`,
          ].filter((part) => part !== '')
                      .join(' '),
        });

        await openAndSwitchToNewTab(driver);
        await driver.get(run.url);
        const result = await run.result;
        // Close the active tab (but not the whole browser, since the
        // initial blank tab is still open).
        await driver.close();
        await driver.switchTo().window(initialTabHandle);

        if (opts.paint === true) {
          const paintTime = await getPaintTime(driver);
          if (paintTime !== undefined) {
            result.paintMillis = [paintTime];
          }
        }
        specResults.get(spec)!.push(result);
        if (bar.curr === bar.total - 1) {
          // Note if we tick with 0 after we've completed, the status is
          // rendered on the next line for some reason.
          bar.tick(1, {status: 'done'});
        } else {
          bar.tick(1);
        }
      }
    }
    // Close the last tab and hence the whole browser too.
    await driver.close();
  }

  await server.close();

  const results: BenchmarkResult[] = [];
  for (const sr of specResults.values()) {
    results.push(combineResults(sr));
  }

  const withStats = results.map(
      (result) => ({
        result,
        stats: summaryStats(opts.paint ? result.paintMillis : result.millis),
      }));
  const baseline = findFastest(withStats);
  const withSlowdowns = computeSlowdowns(withStats, baseline);

  console.log();
  const tableData = [
    tableHeaders,
    ...withSlowdowns.map(formatResultRow),
  ];
  console.log(table.table(tableData, {columns: tableColumns}));

  if (opts.save) {
    const session = await makeSession(results);
    await fsExtra.writeJSON(opts.save, session);
  }
}

main();
