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
import * as webdriver from 'selenium-webdriver';

import commandLineArgs = require('command-line-args');
import commandLineUsage = require('command-line-usage');
import ProgressBar = require('progress');
import ansi = require('ansi-escape-sequences');

import {makeSession} from './session';
import {validBrowsers, makeDriver, openAndSwitchToNewTab, getPaintTime} from './browser';
import {BenchmarkResult, BenchmarkSpec} from './types';
import {Server} from './server';
import {Horizons, ResultStats, horizonsResolved, summaryStats, findFastest, findSlowest, computeSlowdowns} from './stats';
import {specMatchesFilter, specsFromOpts, SpecFilter} from './specs';
import {formatManualResult, formatAutomaticResults, spinner} from './format';
import {prepareVersionDirectories} from './versions';

const optDefs: commandLineUsage.OptionDefinition[] = [
  {
    name: 'help',
    description: 'Show documentation',
    type: Boolean,
    defaultValue: false,
  },
  {
    name: 'root',
    description:
        'Root directory to search for benchmarks (default current directory)',
    type: String,
    defaultValue: './',
  },
  {
    name: 'host',
    description: 'Which host to run on',
    type: String,
    defaultValue: '127.0.0.1',
  },
  {
    name: 'port',
    description: 'Which port to run on (comma-delimited preference list, ' +
        '0 for random, default [8080, 8081, ..., 0])',
    type: (flag: string) => flag.split(',').map(Number),
    defaultValue: [8080, 8081, 8082, 8083, 0],
  },
  {
    name: 'name',
    description: 'Which benchmarks to run (* for all)',
    type: String,
    defaultValue: '*',
  },
  {
    name: 'implementation',
    description: 'Which implementations to run (* for all)',
    alias: 'i',
    type: String,
    defaultValue: '*',
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
        `comma-delimited (${[...validBrowsers].join(', ')})`,
    alias: 'b',
    type: String,
    defaultValue: 'chrome',
  },
  {
    name: 'baseline',
    description:
        'Which result to use as the baseline for comparison: "fastest", ' +
        '"slowest", or e.g. "name=foo,version=bar,...".',
    type: String,
    defaultValue: 'fastest',
  },
  {
    name: 'sample-size',
    description: 'Minimum number of times to run each benchmark',
    alias: 'n',
    type: Number,
    defaultValue: 50,
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
  {
    name: 'horizon',
    description:
        'The degrees of difference to try and resolve when auto-sampling ' +
        '(milliseconds, comma-delimited, optionally signed, default 0%)',
    type: String,
    defaultValue: '0%'
  },
  {
    name: 'timeout',
    description: 'The maximum number of minutes to spend auto-sampling ' +
        '(default 3).',
    type: Number,
    defaultValue: 3,
  },
];

interface Opts {
  help: boolean;
  root: string;
  host: string;
  port: number[];
  name: string;
  implementation: string;
  variant: string;
  'package-version': string[];
  browser: string;
  baseline: string;
  'sample-size': number;
  manual: boolean;
  save: string;
  paint: boolean;
  horizon: string;
  timeout: number;
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

export async function main() {
  const opts = commandLineArgs(optDefs) as Opts;
  if (opts.help) {
    console.log(commandLineUsage([{
      header: 'lit-benchmarks-runner',
      optionList: optDefs,
    }]));
    return;
  }

  if (opts['sample-size'] <= 0) {
    throw new Error('--sample-size must be > 0');
  }

  const specs = await specsFromOpts(opts);
  if (specs.length === 0) {
    throw new Error('No benchmarks matched with the given flags');
  }

  await prepareVersionDirectories(opts.root, specs);

  const server = await Server.start({
    host: opts.host,
    ports: opts.port,
    benchmarksDir: opts.root,
  });

  if (opts.manual === true) {
    await manualMode(opts, specs, server);
  } else {
    await automaticMode(opts, specs, server);
  }
}

/**
 * Let the user run benchmarks manually. This process will not exit until
 * the user sends a termination signal.
 */
async function manualMode(opts: Opts, specs: BenchmarkSpec[], server: Server) {
  if (opts.save) {
    throw new Error(`Can't save results in manual mode`);
  }

  console.log('Visit these URLs in any browser:');
  for (const spec of specs) {
    console.log();
    console.log(
        `${spec.name} ${spec.variant} ` +
        `/ ${spec.implementation} ${spec.version.label}`);
    console.log(ansi.format(`[yellow]{${server.specUrl(spec)}}`));
  }
  console.log(`\nResults will appear below:\n`);
  (async function() {
    for await (const result of server.streamResults()) {
      const resultStats = {result, stats: summaryStats(result.millis)};
      console.log(formatManualResult(resultStats));
    }
  })();
}

interface Browser {
  name: string;
  driver: webdriver.WebDriver;
  initialTabHandle: string;
}

async function automaticMode(
    opts: Opts, specs: BenchmarkSpec[], server: Server) {
  const pickBaseline = pickBaselineFn(specs, opts.baseline);
  const horizons = parseHorizonFlag(opts.horizon);

  console.log('Running benchmarks\n');

  const bar = new ProgressBar('[:bar] :status', {
    total: specs.length * opts['sample-size'],
    width: 58,
  });

  const browsers = new Map<string, Browser>();
  for (const browser of new Set(specs.map((spec) => spec.browser))) {
    bar.tick(0, {status: `launching ${browser}`});
    // It's important that we execute each benchmark iteration in a new tab.
    // At least in Chrome, each tab corresponds to process which shares some
    // amount of cached V8 state which can cause significant measurement
    // effects. There might even be additional interaction effects that
    // would require an entirely new browser to remove, but experience in
    // Chrome so far shows that new tabs are neccessary and sufficient.
    const driver = await makeDriver(browser, opts);
    const tabs = await driver.getAllWindowHandles();
    // We'll always launch new tabs from this initial blank tab.
    const initialTabHandle = tabs[0];
    browsers.set(browser, {name: browser, driver, initialTabHandle});
  }

  const specResults = new Map<BenchmarkSpec, BenchmarkResult[]>();
  for (const spec of specs) {
    specResults.set(spec, []);
  }

  const runSpec = async (spec: BenchmarkSpec) => {
    const run = server.runBenchmark(spec);
    const {driver, initialTabHandle} = browsers.get(spec.browser)!;
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
  };

  // Always collect our minimum number of samples.
  const numRuns = specs.length * opts['sample-size'];
  let run = 0;
  for (let sample = 0; sample < opts['sample-size']; sample++) {
    for (const spec of specs) {
      bar.tick(0, {
        status: [
          `${++run}/${numRuns}`,
          spec.browser,
          spec.name,
          spec.variant,
          `${spec.implementation}@${spec.version.label}`,
        ].filter((part) => part !== '')
                    .join(' '),
      });
      await runSpec(spec);
      if (bar.curr === bar.total - 1) {
        // Note if we tick with 0 after we've completed, the status is
        // rendered on the next line for some reason.
        bar.tick(1, {status: 'done'});
      } else {
        bar.tick(1);
      }
    }
  }

  const makeResults = () => {
    const results: BenchmarkResult[] = [];
    for (const sr of specResults.values()) {
      results.push(combineResults(sr));
    }
    const withStats = results.map(
        (result): ResultStats => ({
          result,
          stats: summaryStats(opts.paint ? result.paintMillis : result.millis),
        }));
    const baseline = pickBaseline(withStats);
    baseline.isBaseline = true;
    const withSlowdowns = computeSlowdowns(withStats, baseline);
    return withSlowdowns;
  };

  let hitTimeout = false;
  if (opts.timeout > 0) {
    console.log();
    const timeoutMs = opts.timeout * 60 * 1000;  // minutes -> millis
    const startMs = Date.now();
    let run = 0;
    let sample = 0;
    while (true) {
      if (horizonsResolved(makeResults(), horizons)) {
        console.log();
        break;
      }
      if ((Date.now() - startMs) >= timeoutMs) {
        hitTimeout = true;
        break;
      }
      // Run batches of 10 additional samples at a time for more presentable
      // sample sizes, and to nudge sample sizes up a little.
      for (let i = 0; i < 10; i++) {
        sample++;
        for (const spec of specs) {
          run++;
          process.stdout.write(
              `\r${spinner[run % spinner.length]} Auto-sample ${sample}`);
          await runSpec(spec);
        }
      }
    }
  }

  // Close the browsers by closing each of their last remaining tabs.
  await Promise.all([...browsers.values()].map(({driver}) => driver.close()));
  await server.close();

  const withSlowdowns = makeResults();
  console.log();
  console.log(formatAutomaticResults(withSlowdowns));

  if (hitTimeout === true) {
    console.log(ansi.format(
        `[bold red]{NOTE} Hit ${opts.timeout} minute auto-sample timeout` +
        ` trying to resolve ${opts.horizon} horizon(s)`));
    console.log('Consider a longer --timeout or different --horizon');
  }

  if (opts.save) {
    const session = await makeSession(withSlowdowns.map((s) => s.result));
    await fsExtra.writeJSON(opts.save, session);
  }
}

/** Parse the --horizon flag into signed horizon values. */
export function parseHorizonFlag(flag: string): Horizons {
  const absolute = new Set<number>();
  const relative = new Set<number>();
  const strs = flag.split(',');
  for (const str of strs) {
    if (!str.match(/^[-+]?(\d*\.)?\d+(ms|%)$/)) {
      throw new Error(`Invalid --horizon ${flag}`);
    }

    let num;
    let absOrRel;
    const isPercent = str.endsWith('%');
    if (isPercent === true) {
      num = Number(str.slice(0, -1)) / 100;
      absOrRel = relative;
    } else {
      // Otherwise ends with "ms".
      num = Number(str.slice(0, -2));  // Note that Number("+1") === 1
      absOrRel = absolute;
    }

    if (str.startsWith('+') || str.startsWith('-') || num === 0) {
      // If the sign was explicit (e.g. "+0.1", "-0.1") then we're only
      // interested in that signed horizon.
      absOrRel.add(num);
    } else {
      // Otherwise (e.g. "0.1") we're interested in the horizon as a
      // difference in either direction.
      absOrRel.add(-num);
      absOrRel.add(num);
    }
  }
  return {
    absolute: [...absolute].sort((a, b) => a - b),
    relative: [...relative].sort((a, b) => a - b),
  };
}

/**
 * Parse the --baseline flag in the context of the benchmarks we're
 * preparing to run, and return a function which, once we have results, will
 * be able to pick a single result to use as the baseline for comparison.
 */
export function pickBaselineFn(specs: BenchmarkSpec[], flag: string):
    (specs: ResultStats[]) => ResultStats {
  // Special cases.
  if (flag === 'fastest') {
    return findFastest;
  }
  if (flag === 'slowest') {
    return findSlowest;
  }

  // Try to select one benchmarks from the given key=val filters, e.g.
  // "name=my-bench,variant=fun,implementation=lit-html,version=v1".
  const filter: SpecFilter = {};
  for (const keyVal of flag.split(',')) {
    const [key, val] = keyVal.split('=').map((s) => s.trim());
    if (key === '' || val === '' || val.includes('=')) {
      throw new Error('Invalid baseline flag syntax');
    }
    if (key === 'name') {
      filter.name = val;
    } else if (key === 'variant') {
      filter.variant = val;
    } else if (key === 'implementation') {
      filter.implementation = val;
    } else if (key === 'version') {
      filter.version = val;
    } else if (key === 'browser') {
      filter.browser = val;
    } else {
      throw new Error(`Invalid baseline flag key ${key}`);
    }
  }
  const filtered = specs.filter((spec) => specMatchesFilter(spec, filter));
  if (filtered.length === 0) {
    throw new Error('No benchmarks matched by baseline flag');
  }
  if (filtered.length > 1) {
    throw new Error('Ambiguous baseline flag');
  }
  const spec = filtered[0];
  return (results) => results.find(
             ({result}: ResultStats) => result.name === spec.name &&
                 result.implementation === spec.implementation &&
                 result.variant === spec.variant &&
                 result.version === spec.version.label)!;
}
