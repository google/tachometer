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

import * as fsExtra from 'fs-extra';
import * as webdriver from 'selenium-webdriver';

import ProgressBar = require('progress');
import ansi = require('ansi-escape-sequences');

import {jsonOutput, legacyJsonOutput} from './json-output';
import {browserSignature, makeDriver, openAndSwitchToNewTab, pollForGlobalResult, pollForFirstContentfulPaint} from './browser';
import {BenchmarkResult, BenchmarkSpec} from './types';
import {formatCsv} from './csv';
import {ResultStats, ResultStatsWithDifferences, horizonsResolved, summaryStats, computeDifferences} from './stats';
import {verticalTermResultTable, horizontalTermResultTable, verticalHtmlResultTable, horizontalHtmlResultTable, automaticResultTable, spinner, benchmarkOneLiner} from './format';
import {Config} from './config';
import * as github from './github';
import {Server} from './server';
import {specUrl} from './specs';

function combineResults(results: BenchmarkResult[]): BenchmarkResult {
  const combined: BenchmarkResult = {
    ...results[0],
    millis: [],
  };
  for (const result of results) {
    combined.millis.push(...result.millis);
  }
  return combined;
}

interface Browser {
  name: string;
  driver: webdriver.WebDriver;
  initialTabHandle: string;
}

export async function automaticMode(
    config: Config, servers: Map<BenchmarkSpec, Server>):
    Promise<Array<ResultStatsWithDifferences>|undefined> {
  let completeGithubCheck;
  if (config.githubCheck !== undefined) {
    completeGithubCheck = await github.createCheck(config.githubCheck);
  }

  console.log('Running benchmarks\n');

  const specs = config.benchmarks;
  const bar = new ProgressBar('[:bar] :status', {
    total: specs.length * (config.sampleSize + /** warmup */ 1),
    width: 58,
  });

  const browsers = new Map<string, Browser>();
  for (const {browser} of specs) {
    const sig = browserSignature(browser);
    if (browsers.has(sig)) {
      continue;
    }
    bar.tick(0, {status: `launching ${browser.name}`});
    // It's important that we execute each benchmark iteration in a new tab.
    // At least in Chrome, each tab corresponds to process which shares some
    // amount of cached V8 state which can cause significant measurement
    // effects. There might even be additional interaction effects that
    // would require an entirely new browser to remove, but experience in
    // Chrome so far shows that new tabs are neccessary and sufficient.
    const driver = await makeDriver(browser);
    const tabs = await driver.getAllWindowHandles();
    // We'll always launch new tabs from this initial blank tab.
    const initialTabHandle = tabs[0];
    browsers.set(sig, {name: browser.name, driver, initialTabHandle});
  }

  const runSpec = async(spec: BenchmarkSpec): Promise<BenchmarkResult> => {
    let server;
    if (spec.url.kind === 'local') {
      server = servers.get(spec);
      if (server === undefined) {
        throw new Error('Internal error: no server for spec');
      }
    }

    const url = specUrl(spec, servers, config);
    const {driver, initialTabHandle} =
        browsers.get(browserSignature(spec.browser))!;

    let millis;
    let bytesSent = 0;
    let userAgent = '';
    // TODO(aomarks) Make maxAttempts and timeouts configurable.
    const maxAttempts = 3;
    for (let attempt = 1;; attempt++) {
      await openAndSwitchToNewTab(driver, spec.browser);
      await driver.get(url);

      if (spec.measurement === 'fcp') {
        millis = await pollForFirstContentfulPaint(driver);
      } else if (spec.measurement === 'global') {
        millis = await pollForGlobalResult(driver);
      } else {  // bench.start() and bench.stop() callback
        if (server === undefined) {
          throw new Error('Internal error: no server for spec');
        }
        millis = (await server.nextResults()).millis;
      }

      // Close the active tab (but not the whole browser, since the
      // initial blank tab is still open).
      await driver.close();
      await driver.switchTo().window(initialTabHandle);

      if (server !== undefined) {
        const session = server.endSession();
        bytesSent = session.bytesSent;
        userAgent = session.userAgent;
      }

      if (millis !== undefined || attempt >= maxAttempts) {
        break;
      }

      console.log(
          `\n\nFailed ${attempt}/${maxAttempts} times ` +
          `to get a ${spec.measurement} measurement ` +
          `in ${spec.browser.name} from ${url}. Retrying.`);
    }

    if (millis === undefined) {
      console.log();
      throw new Error(
          `\n\nFailed ${maxAttempts}/${maxAttempts} times ` +
          `to get a ${spec.measurement} measurement ` +
          `in ${spec.browser.name} from ${url}. Aborting.\n`);
    }

    return {
      name: spec.name,
      queryString: spec.url.kind === 'local' ? spec.url.queryString : '',
      version: spec.url.kind === 'local' && spec.url.version !== undefined ?
          spec.url.version.label :
          '',
      millis: [millis],
      bytesSent,
      browser: spec.browser,
      userAgent,
    };
  };

  // Do one throw-away run per benchmark to warm up our server (especially
  // when expensive bare module resolution is enabled), and the browser.
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    bar.tick(0, {
      status: `warmup ${i + 1}/${specs.length} ${benchmarkOneLiner(spec)}`,
    });
    await runSpec(spec);
    bar.tick(1);
  }

  const specResults = new Map<BenchmarkSpec, BenchmarkResult[]>();
  for (const spec of specs) {
    specResults.set(spec, []);
  }

  // Always collect our minimum number of samples.
  const numRuns = specs.length * config.sampleSize;
  let run = 0;
  for (let sample = 0; sample < config.sampleSize; sample++) {
    for (const spec of specs) {
      bar.tick(0, {
        status: `${++run}/${numRuns} ${benchmarkOneLiner(spec)}`,
      });
      specResults.get(spec)!.push(await runSpec(spec));
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
    const withStats = results.map((result): ResultStats => ({
                                    result,
                                    stats: summaryStats(result.millis),
                                  }));
    return computeDifferences(withStats);
  };

  let hitTimeout = false;
  if (config.timeout > 0) {
    console.log();
    const timeoutMs = config.timeout * 60 * 1000;  // minutes -> millis
    const startMs = Date.now();
    let run = 0;
    let sample = 0;
    let elapsed = 0;
    while (true) {
      if (horizonsResolved(makeResults(), config.horizons)) {
        console.log();
        break;
      }
      if (elapsed >= timeoutMs) {
        hitTimeout = true;
        break;
      }
      // Run batches of 10 additional samples at a time for more presentable
      // sample sizes, and to nudge sample sizes up a little.
      for (let i = 0; i < 10; i++) {
        sample++;
        for (const spec of specs) {
          run++;
          elapsed = Date.now() - startMs;
          const remainingSecs =
              Math.max(0, Math.round((timeoutMs - elapsed) / 1000));
          const mins = Math.floor(remainingSecs / 60);
          const secs = remainingSecs % 60;
          process.stdout.write(
              `\r${spinner[run % spinner.length]} Auto-sample ${sample} ` +
              `(timeout in ${mins}m${secs}s)` + ansi.erase.inLine(0));
          specResults.get(spec)!.push(await runSpec(spec));
        }
      }
    }
  }

  // Close the browsers by closing each of their last remaining tabs.
  await Promise.all([...browsers.values()].map(({driver}) => driver.close()));

  const withDifferences = makeResults();
  console.log();
  const {fixed, unfixed} = automaticResultTable(withDifferences);
  console.log(horizontalTermResultTable(fixed));
  console.log(verticalTermResultTable(unfixed));

  if (hitTimeout === true) {
    console.log(ansi.format(
        `[bold red]{NOTE} Hit ${config.timeout} minute auto-sample timeout` +
        ` trying to resolve horizon(s)`));
    console.log('Consider a longer --timeout or different --horizon');
  }

  if (config.jsonFile) {
    const json = await jsonOutput(withDifferences);
    await fsExtra.writeJSON(config.jsonFile, json, {spaces: 2});
  }

  // TOOD(aomarks) Remove this in next major version.
  if (config.legacyJsonFile) {
    const json = await legacyJsonOutput(withDifferences.map((s) => s.result));
    await fsExtra.writeJSON(config.legacyJsonFile, json);
  }

  if (config.csvFile) {
    await fsExtra.writeFile(config.csvFile, formatCsv(withDifferences));
  }

  if (completeGithubCheck !== undefined) {
    const markdown = horizontalHtmlResultTable(fixed) + '\n' +
        verticalHtmlResultTable(unfixed);
    await completeGithubCheck(markdown);
  }

  return withDifferences;
}
