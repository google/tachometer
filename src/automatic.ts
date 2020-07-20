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
import {browserSignature, makeDriver, openAndSwitchToNewTab} from './browser';
import {measure} from './measure';
import {BenchmarkResult, BenchmarkSpec} from './types';
import {formatCsvStats, formatCsvRaw} from './csv';
import {ResultStats, ResultStatsWithDifferences, horizonsResolved, summaryStats, computeDifferences} from './stats';
import {verticalTermResultTable, horizontalTermResultTable, verticalHtmlResultTable, horizontalHtmlResultTable, automaticResultTable, spinner, benchmarkOneLiner} from './format';
import {Config} from './config';
import * as github from './github';
import {Server} from './server';
import {specUrl} from './specs';
import {wait} from './util';

interface Browser {
  name: string;
  driver: webdriver.WebDriver;
  initialTabHandle: string;
}

export class AutomaticMode {
  private config: Config;
  private specs: BenchmarkSpec[];
  private servers: Map<BenchmarkSpec, Server>;
  private browsers = new Map<string, Browser>();
  private bar: ProgressBar;
  private completeGithubCheck?: (markdown: string) => void;
  private specResults = new Map<BenchmarkSpec, BenchmarkResult[]>();
  private hitTimeout = false;

  constructor(config: Config, servers: Map<BenchmarkSpec, Server>) {
    this.config = config;
    this.specs = config.benchmarks;
    this.servers = servers;
    this.bar = new ProgressBar('[:bar] :status', {
      total: this.specs.length * (config.sampleSize + /** warmup */ 1),
      width: 58,
    });
  }

  async run(): Promise<Array<ResultStatsWithDifferences>|undefined> {
    await this.launchBrowsers();
    if (this.config.githubCheck !== undefined) {
      this.completeGithubCheck =
          await github.createCheck(this.config.githubCheck);
    }
    console.log('Running benchmarks\n');
    await this.warmup();
    for (const spec of this.specs) {
      this.specResults.set(spec, []);
    }
    await this.takeMinimumSamples();
    await this.takeAdditionalSamples();
    await this.closeBrowsers();
    const results = this.makeResults();
    await this.outputResults(results);
    return results;
  }

  private async launchBrowsers() {
    for (const {browser} of this.specs) {
      const sig = browserSignature(browser);
      if (this.browsers.has(sig)) {
        continue;
      }
      this.bar.tick(0, {status: `launching ${browser.name}`});
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
      this.browsers.set(sig, {name: browser.name, driver, initialTabHandle});
    }
  }

  private async closeBrowsers() {
    // Close the browsers by closing each of their last remaining tabs.
    await Promise.all(
        [...this.browsers.values()].map(({driver}) => driver.close()));
  }

  /**
   * Do one throw-away run per benchmark to warm up our server (especially
   * when expensive bare module resolution is enabled), and the browser.
   */
  private async warmup() {
    const {specs, bar} = this;
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      bar.tick(0, {
        status: `warmup ${i + 1}/${specs.length} ${benchmarkOneLiner(spec)}`,
      });
      await this.takeSample(spec);
      bar.tick(1);
    }
  }

  private async takeMinimumSamples() {
    // Always collect our minimum number of samples.
    const {config, specs, bar, specResults} = this;
    const numRuns = specs.length * config.sampleSize;
    let run = 0;
    for (let sample = 0; sample < config.sampleSize; sample++) {
      for (const spec of specs) {
        bar.tick(0, {
          status: `${++run}/${numRuns} ${benchmarkOneLiner(spec)}`,
        });
        specResults.get(spec)!.push(await this.takeSample(spec));
        if (bar.curr === bar.total - 1) {
          // Note if we tick with 0 after we've completed, the status is
          // rendered on the next line for some reason.
          bar.tick(1, {status: 'done'});
        } else {
          bar.tick(1);
        }
      }
    }
  }

  private async takeAdditionalSamples() {
    const {config, specs, specResults} = this;
    if (config.timeout > 0) {
      console.log();
      const timeoutMs = config.timeout * 60 * 1000;  // minutes -> millis
      const startMs = Date.now();
      let run = 0;
      let sample = 0;
      let elapsed = 0;
      while (true) {
        if (horizonsResolved(this.makeResults(), config.horizons)) {
          console.log();
          break;
        }
        if (elapsed >= timeoutMs) {
          this.hitTimeout = true;
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
            specResults.get(spec)!.push(await this.takeSample(spec));
          }
        }
      }
    }
  }

  private async takeSample(spec: BenchmarkSpec): Promise<BenchmarkResult> {
    const {servers, config, browsers} = this;

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

    let millis: number|undefined;
    let bytesSent = 0;
    let userAgent = '';
    // TODO(aomarks) Make maxAttempts and timeouts configurable.
    const maxAttempts = 3;
    for (let attempt = 1;; attempt++) {
      await openAndSwitchToNewTab(driver, spec.browser);
      await driver.get(url);
      for (let waited = 0; millis === undefined && waited <= 10000;
           waited += 50) {
        await wait(50);
        millis = await measure(driver, spec, server);
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
          (spec.measurement === 'global' ?
               `(from '${spec.measurementExpression}') ` :
               '') +
          `in ${spec.browser.name} from ${url}. Retrying.`);
    }

    if (millis === undefined) {
      console.log();
      throw new Error(
          `\n\nFailed ${maxAttempts}/${maxAttempts} times ` +
          `to get a ${spec.measurement} measurement ` +
          (spec.measurement === 'global' ?
               `(from '${spec.measurementExpression}') ` :
               '') +
          `in ${spec.browser.name} from ${url}. Retrying.`);
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
  }

  makeResults() {
    const results: BenchmarkResult[] = [];
    for (const sr of this.specResults.values()) {
      const combined: BenchmarkResult = {
        ...sr[0],
        millis: [],
      };
      for (const result of sr) {
        combined.millis.push(...result.millis);
      }
      results.push(combined);
    }
    const withStats = results.map((result): ResultStats => ({
                                    result,
                                    stats: summaryStats(result.millis),
                                  }));
    return computeDifferences(withStats);
  }

  private async outputResults(withDifferences: ResultStatsWithDifferences[]) {
    const {config, hitTimeout} = this;
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

    if (config.csvFileStats) {
      await fsExtra.writeFile(
          config.csvFileStats, formatCsvStats(withDifferences));
    }
    if (config.csvFileRaw) {
      await fsExtra.writeFile(config.csvFileRaw, formatCsvRaw(withDifferences));
    }

    if (this.completeGithubCheck !== undefined) {
      const markdown = horizontalHtmlResultTable(fixed) + '\n' +
          verticalHtmlResultTable(unfixed);
      await this.completeGithubCheck(markdown);
    }
  }
}
