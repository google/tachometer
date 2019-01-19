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

import * as fs from 'fs-extra';
import * as path from 'path';
import * as table from 'table';

import {Builder} from 'selenium-webdriver';
import commandLineArgs = require('command-line-args');
import commandLineUsage = require('command-line-usage');

import {BenchmarkSpec, RunData} from './types';
import {Server} from './server';
// import {getRunData} from './system';

const repoRoot = path.resolve(__dirname, '..', '..');

const optDefs: commandLineUsage.OptionDefinition[] = [
  {
    name: 'help',
    description: 'Show this documentation',
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
    name: 'benchmark',
    description: 'Which benchmarks to run',
    alias: 'b',
    type: String,
    defaultValue: '*',
  },
  {
    name: 'implementation',
    description: 'Which implementations to run',
    alias: 'i',
    type: String,
    defaultValue: 'lit-html',
  },
  {
    name: 'manual',
    description: 'Don\'t launch browsers, just show URLs and collect results.',
    alias: 'm',
    type: Boolean,
    defaultValue: false,
  },
];

interface Opts {
  help: boolean;
  host: string;
  port: number;
  benchmark: string;
  implementation: string;
  manual: boolean;
}

const ignoreFiles = new Set([
  'node_modules',
  'package.json',
  'package-lock.json',
  // TODO(aomarks) Remove after old files removed.
  'old',
]);

async function specsFromOpts(opts: Opts): Promise<BenchmarkSpec[]> {
  const specs = [];
  let impls;
  if (opts.implementation === '*') {
    impls = await fs.readdir(path.join(repoRoot, 'benchmarks'));
    impls = impls.filter((dir) => !ignoreFiles.has(dir));
  } else {
    impls = opts.implementation.split(',');
  }
  for (const implementation of impls) {
    const dir = path.join(repoRoot, 'benchmarks', implementation);
    let benchmarks;
    if (opts.benchmark === '*') {
      benchmarks = await fs.readdir(dir);
      benchmarks = benchmarks.filter((dir) => !ignoreFiles.has(dir));
    } else {
      benchmarks = opts.benchmark.split(',');
    }
    for (const benchmark of benchmarks) {
      specs.push({
        benchmark,
        implementation,
        urlPath: `/benchmarks/${implementation}/${benchmark}/`,
      });
    }
  }
  return specs;
}

export async function saveRun(benchmarkName: string, newData: RunData) {
  const filename = path.resolve(
      __dirname, '..', '..', 'benchmarks', benchmarkName, 'runs.json');
  let data: {runs: RunData[]}|undefined;
  let contents: string|undefined;
  try {
    contents = await fs.readFile(filename, 'utf-8');
  } catch (e) {
  }
  if (contents !== undefined && contents.trim() !== '') {
    data = JSON.parse(contents);
  }
  if (data === undefined) {
    data = {runs: []};
  }
  if (data.runs === undefined) {
    data.runs = [];
  }
  data.runs.push(newData);
  fs.writeFile(filename, JSON.stringify(data));
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

  const specs = await specsFromOpts(opts);
  const server = await Server.start({
    host: opts.host,
    port: opts.port,
    rootDir: repoRoot,
  });

  if (opts.manual === true) {
    const urlTable: string[][] = [];
    for (const spec of specs) {
      urlTable.push([
        spec.benchmark,
        spec.implementation,
        `${server.url}${spec.urlPath}`,
      ]);
    }
    console.log();
    console.log('Visit these URLs in any browser:');
    console.log();
    console.log(table.table(urlTable));

    console.log('Results will appear below:');
    console.log();
    const stream = table.createStream({
      columnCount: 3,
      columnDefault: {
        width: 15,
      },
    });
    (async function() {
      for await (const result of server.streamResults()) {
        // TODO(aomarks) Upstream this type to DT, it's wrong.
        (stream.write as unknown as (cols: string[]) => void)([
          result.browser.name,
          result.browser.version,
          `${result.ms.toFixed(3)} ms`,
        ]);
      }
    })();

  } else {
    const driver = await new Builder().forBrowser('chrome').build();
    const tableData: string[][] = [];
    for (const spec of specs) {
      console.log(
          `Running benchmark ${spec.benchmark} in ${spec.implementation}`);
      const run = server.runBenchmark(spec);
      await driver.get(run.url);
      const result = await run.result;
      // const fullName = `${spec.implementation}-${spec.benchmark}`;
      // const runData = await getRunData(fullName, results);
      // await saveRun(fullName, runData);
      tableData.push([
        spec.benchmark,
        spec.implementation,
        result.browser.name,
        result.browser.version,
        `${result.ms.toFixed(3)} ms`,
      ]);
    }

    console.log();
    console.log(table.table(tableData));

    await Promise.all([
      driver.close(),
      server.close(),
    ]);
  }
}

main();
