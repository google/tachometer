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
require('chromedriver');
require('geckodriver');

import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as table from 'table';

import * as webdriver from 'selenium-webdriver';
import * as chrome from 'selenium-webdriver/chrome';
import commandLineArgs = require('command-line-args');
import commandLineUsage = require('command-line-usage');
import ansi = require('ansi-escape-sequences');
import ProgressBar = require('progress');

import {makeSession} from './session';
import {ConfigFormat, BenchmarkResult, BenchmarkSpec} from './types';
import {Server} from './server';
import {summaryStats} from './stats';

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
  browser: string;
  trials: number;
  manual: boolean;
  save: string;
  paint: boolean;
}

const ignoreFiles = new Set([
  'node_modules',
  'package.json',
  'package-lock.json',
  'common',
]);

async function specsFromOpts(opts: Opts): Promise<BenchmarkSpec[]> {
  const specs: BenchmarkSpec[] = [];
  let impls;
  if (opts.implementation === '*') {
    impls = await fsExtra.readdir(path.join(repoRoot, 'benchmarks'));
    impls = impls.filter((dir) => !ignoreFiles.has(dir));
  } else {
    impls = opts.implementation.split(',');
  }

  const variants = new Set(
      opts.variant.split(',').map((v) => v.trim()).filter((v) => v !== ''));

  for (const implementation of impls) {
    const implDir = path.join(repoRoot, 'benchmarks', implementation);
    let benchmarks;
    if (opts.name === '*') {
      benchmarks = await fsExtra.readdir(implDir);
      benchmarks = benchmarks.filter((implDir) => !ignoreFiles.has(implDir));
    } else {
      benchmarks = opts.name.split(',');
    }
    for (const name of benchmarks) {
      const benchDir = path.join(implDir, name);
      if (!await fsExtra.pathExists(benchDir)) {
        continue;
      }
      let config: ConfigFormat|undefined;
      try {
        config = await fsExtra.readJson(path.join(benchDir, 'benchmarks.json'));
      } catch (e) {
        if (e.code !== 'ENOENT') {
          throw e;
        }
      }
      if (config && config.variants && config.variants.length) {
        for (const variant of config.variants) {
          if (variant.name &&
              (variants.has('*') || variants.has(variant.name))) {
            specs.push({
              name,
              implementation,
              variant: variant.name || '',
              config: variant.config || {},
              trials: opts.trials,
            });
          }
        }
      } else if (opts.variant === '*') {
        specs.push({
          name,
          implementation,
          variant: '',
          config: {},
          trials: opts.trials,
        });
      }
    }
  }

  specs.sort((a, b) => {
    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }
    if (a.variant !== b.variant) {
      return a.variant.localeCompare(b.variant);
    }
    if (a.implementation !== b.implementation) {
      return a.implementation.localeCompare(b.implementation);
    }
    return 0;
  });

  return specs;
}

const tableHeaders = [
  'Benchmark',       // 0
  'Variant',         // 1
  'Implementation',  // 2
  'Browser',         // 3
  '(Version)',       // 4
  'Trials',          // 5
  'Mean',            // 7
  '95% CI',          // 8
  'StdDev',          // 9
  'Max',             // 10
].map((header) => ansi.format(`[bold]{${header}}`));

const tableColumns: {[key: string]: table.ColumnConfig} = {
  0: {
    width: 15,
  },
  1: {
    width: 15,
  },
  2: {
    width: 15,
  },
  3: {
    width: 8,
  },
  4: {
    width: 12,
  },
  5: {
    alignment: 'center',
    width: 6,
  },
  6: {
    alignment: 'right',
    width: 7,
  },
  7: {
    alignment: 'right',
    width: 7,
  },
  8: {
    alignment: 'right',
    width: 7,
  },
  9: {
    alignment: 'right',
    width: 7,
  },
};

function formatResultRow(result: BenchmarkResult, paint: boolean): string[] {
  const stats =
      summaryStats(paint === true ? result.paintMillis : result.millis);
  return [
    result.name,
    result.variant,
    result.implementation,
    result.browser.name,
    result.browser.version,
    stats.size.toFixed(0),
    stats.arithmeticMean.toFixed(2),
    `± ${stats.confidenceInterval95.toFixed(2)}`,
    stats.standardDeviation.toFixed(2),
    stats.max.toFixed(2),
  ];
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

  const specs = await specsFromOpts(opts);
  if (specs.length === 0) {
    throw new Error('No benchmarks matched with the given flags');
  }

  const server = await Server.start({
    host: opts.host,
    port: opts.port,
    rootDir: repoRoot,
  });

  let saveStream;
  if (opts.save) {
    saveStream = await fsExtra.createWriteStream(opts.save, {flags: 'a'});
  }

  if (opts.manual === true) {
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
        streamWrite(formatResultRow(result, opts.paint));
        if (saveStream !== undefined) {
          const session = await makeSession([result]);
          saveStream.write(JSON.stringify(session));
          saveStream.write('\n');
        }
      }
    })();

  } else {
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

    const results: BenchmarkResult[] = [];
    for (const browser of browsers) {
      bar.tick(0, {status: `launching ${browser}`});
      const driver = await makeDriver(browser);
      for (const spec of specs) {
        const trialResults = [];
        for (let t = 0; t < spec.trials; t++) {
          const run = server.runBenchmark(spec);
          bar.tick(0, {
            status: `${browser} ${spec.implementation} ${spec.name} ` +
                `${spec.variant} ${t + 1}/${spec.trials}`,
          });
          await driver.get(run.url);
          const result = await run.result;
          const paintTime = await getPaintTime(driver);
          if (paintTime !== undefined) {
            result.paintMillis = [paintTime];
          }
          trialResults.push(result);
          if (bar.curr === bar.total - 1) {
            // Note if we tick with 0 after we've completed, the status is
            // rendered on the next line for some reason.
            bar.tick(1, {status: 'done'});
          } else {
            bar.tick(1);
          }
        }
        results.push(combineResults(trialResults));
      }
      await driver.close();
    }
    console.log();

    if (saveStream !== undefined) {
      const session = await makeSession(results);
      saveStream.write(JSON.stringify(session));
      saveStream.write('\n');
    }

    const tableData = [
      tableHeaders,
      ...results.map((r) => formatResultRow(r, opts.paint)),
    ];
    console.log(table.table(tableData, {columns: tableColumns}));
    if (saveStream !== undefined) {
      saveStream.end();
    }
    await server.close();
  }
}

const chromeLogging = new webdriver.logging.Preferences();
chromeLogging.setLevel(
    webdriver.logging.Type.PERFORMANCE, webdriver.logging.Level.ALL);

const chromeOpts = new chrome.Options();
chromeOpts.setLoggingPrefs(chromeLogging);
chromeOpts.setPerfLoggingPrefs({
  traceCategories: ['devtools.timeline'].join(','),
} as unknown as chrome.IPerfLoggingPrefs);  // Wrong typings.

async function makeDriver(browser: string): Promise<webdriver.WebDriver> {
  return await new webdriver.Builder()
      .forBrowser(browser)
      .setChromeOptions(chromeOpts)
      .build();
}

async function getPaintTime(driver: webdriver.WebDriver):
    Promise<number|undefined> {
  let benchStartCalled;
  // TODO(aomarks) Do we need a loop to ensure we get all the logs?
  const perfLogs =
      await driver.manage().logs().get(webdriver.logging.Type.PERFORMANCE);
  for (const entry of perfLogs) {
    const {method, params} = JSON.parse(entry.message).message;
    if (method === 'Tracing.dataCollected') {
      if (params.name === 'TimeStamp') {
        if (params.args.data.message === 'benchStartCalled') {
          benchStartCalled = params.ts / 1000;
        }
      } else if (params.name === 'Paint' && benchStartCalled !== undefined) {
        return ((params.ts + params.dur) / 1000) - benchStartCalled;
      }
    }
  }
}

main();
