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

import {Builder} from 'selenium-webdriver';
import commandLineArgs = require('command-line-args');
import commandLineUsage = require('command-line-usage');
import ansi = require('ansi-escape-sequences');

import {makeSession} from './session';
import {ConfigFormat, BenchmarkResult, BenchmarkSpec} from './types';
import {Server} from './server';

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
];

interface Opts {
  help: boolean;
  host: string;
  port: number;
  name: string;
  implementation: string;
  browser: string;
  trials: number;
  manual: boolean;
  save: string;
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
          specs.push({
            name,
            implementation,
            variant: variant.name || '',
            config: variant.config || {},
            trials: opts.trials,
          });
        }
      } else {
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
  return specs;
}

const tableHeaders = [
  'Benchmark',       // 0
  'Implementation',  // 1
  'Variant',         // 2
  'Browser',         // 3
  '(Version)',       // 4
  'Trials',          // 5
  'Worst (ms)',      // 6
  'Avg (ms)',        // 7
].map((header) => ansi.format(`[bold]{${header}}`));

const tableColumns: {[key: string]: table.ColumnConfig} = {
  0: {
    width: 10,
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
    width: 10,
  },
  7: {
    alignment: 'right',
    width: 8,
  },
};

function formatResultRow(result: BenchmarkResult): string[] {
  const millis = result.millis;
  const len = millis.length;
  const sum = millis.reduce((acc, cur) => acc + cur);
  const avg = sum / len;
  const worst = Math.max(...millis);
  return [
    result.name,
    result.implementation,
    result.variant,
    result.browser.name,
    result.browser.version,
    len.toString(),
    worst.toFixed(3),
    avg.toFixed(3),
  ];
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
        streamWrite(formatResultRow(result));
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

    const results: BenchmarkResult[] = [];
    for (const browser of browsers) {
      console.log(`Launching ${browser}`);
      const driver = await new Builder().forBrowser(browser).build();
      for (const spec of specs) {
        console.log(
            `    Running benchmark ${spec.name} in ${spec.implementation}`);
        const run = server.runBenchmark(spec);
        await driver.get(run.url);
        results.push(await run.result);
      }
      console.log();
      await driver.close();
    }

    if (saveStream !== undefined) {
      const session = await makeSession(results);
      saveStream.write(JSON.stringify(session));
      saveStream.write('\n');
    }

    const tableData = [
      tableHeaders,
      ...results.map(formatResultRow),
    ];
    console.log(table.table(tableData, {columns: tableColumns}));
    if (saveStream !== undefined) {
      saveStream.end();
    }
    await server.close();
  }
}

main();
