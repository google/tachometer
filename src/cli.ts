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
import * as webdriver from 'selenium-webdriver';

import commandLineArgs = require('command-line-args');
import commandLineUsage = require('command-line-usage');
import ProgressBar = require('progress');
import ansi = require('ansi-escape-sequences');

import {Opts, optDefs} from './flags';
import {makeSession} from './session';
import {browserSignature, fcpBrowsers, makeDriver, openAndSwitchToNewTab, pollForGlobalResult, pollForFirstContentfulPaint} from './browser';
import {BenchmarkResult, BenchmarkSpec} from './types';
import {Server} from './server';
import {Horizons, ResultStats, ResultStatsWithDifferences, horizonsResolved, summaryStats, computeDifferences} from './stats';
import {specsFromOpts} from './specs';
import {AutomaticResults, verticalTermResultTable, horizontalTermResultTable, verticalHtmlResultTable, horizontalHtmlResultTable, automaticResultTable, spinner, benchmarkOneLiner} from './format';
import {prepareVersionDirectory, makeServerPlans} from './versions';
import {parseConfigFile, Config, defaultRoot, defaultSampleSize, defaultTimeout, defaultHorizons, writeBackSchemaIfNeeded} from './config';
import * as github from './github';

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

const getVersion = (): string =>
    require(path.join(__dirname, '..', 'package.json')).version;

export async function main(argv: string[]):
    Promise<Array<ResultStatsWithDifferences>|undefined> {
  const opts = commandLineArgs(optDefs, {partial: true, argv}) as Opts;
  console.log(opts['resolve-bare-modules']);

  if (opts.help) {
    console.log(commandLineUsage([
      {
        header: 'tach',
        content: `v${getVersion()}\nhttps://github.com/PolymerLabs/tachometer`,
      },
      {
        header: 'Usage',
        content: `
Run a benchmark from a local file:
$ tach foo.html

Compare a benchmark with different URL parameters:
$ tach foo.html?i=1 foo.html?i=2

Benchmark index.html in a directory:
$ tach foo/bar

Benchmark a remote URL's First Contentful Paint time:
$ tach http://example.com
`,
      },
      {
        header: 'Options',
        optionList: optDefs,
      },
    ]));
    return;
  }

  if (opts.version) {
    console.log(getVersion());
    return;
  }

  // These options are only controlled by flags.
  const baseConfig = {
    mode: (opts.manual === true ? 'manual' : 'automatic') as
        ('manual' | 'automatic'),
    savePath: opts.save,
    githubCheck: opts['github-check'] ?
        github.parseCheckFlag(opts['github-check']) :
        undefined,
    remoteAccessibleHost: opts['remote-accessible-host'],
  };

  let config: Config;
  if (opts.config) {
    if (opts.root !== undefined) {
      throw new Error('--root cannot be specified when using --config');
    }
    if (opts.browser !== undefined) {
      throw new Error('--browser cannot be specified when using --config');
    }
    if (opts['sample-size'] !== undefined) {
      throw new Error('--sample-size cannot be specified when using --config');
    }
    if (opts.timeout !== undefined) {
      throw new Error('--timeout cannot be specified when using --config');
    }
    if (opts.horizon !== undefined) {
      throw new Error('--horizon cannot be specified when using --config');
    }
    if (opts.measure !== undefined) {
      throw new Error('--measure cannot be specified when using --config');
    }
    if (opts['resolve-bare-modules'] !== undefined) {
      throw new Error(
          '--resolve-bare-modules cannot be specified when using --config');
    }
    if (opts['window-size'] !== undefined) {
      throw new Error('--window-size cannot be specified when using --config');
    }
    const rawConfigObj = await fsExtra.readJson(opts.config);
    const validatedConfigObj = await parseConfigFile(rawConfigObj);

    await writeBackSchemaIfNeeded(rawConfigObj, opts.config);

    config = {
      ...baseConfig,
      ...validatedConfigObj,
    };

  } else {
    config = {
      ...baseConfig,
      root: opts.root !== undefined ? opts.root : defaultRoot,
      sampleSize: opts['sample-size'] !== undefined ? opts['sample-size'] :
                                                      defaultSampleSize,
      timeout: opts.timeout !== undefined ? opts.timeout : defaultTimeout,
      horizons: parseHorizons(
          opts.horizon !== undefined ? opts.horizon.split(',') :
                                       defaultHorizons),
      benchmarks: await specsFromOpts(opts),
      resolveBareModules: opts['resolve-bare-modules'] !== undefined ?
          opts['resolve-bare-modules'] :
          true,
      forceCleanNpmInstall: opts['force-clean-npm-install'],
    };
  }

  if (config.sampleSize <= 1) {
    throw new Error('--sample-size must be > 1');
  }

  if (config.timeout < 0) {
    throw new Error('--timeout must be >= 0');
  }

  if (config.benchmarks.length === 0) {
    throw new Error('No benchmarks matched with the given flags');
  }

  for (const spec of config.benchmarks) {
    if (spec.measurement === 'fcp' && !fcpBrowsers.has(spec.browser.name)) {
      throw new Error(
          `Browser ${spec.browser.name} does not support the ` +
          `first contentful paint (FCP) measurement`);
    }
  }

  const plans = await makeServerPlans(
      config.root, opts['npm-install-dir'], config.benchmarks);

  const servers = new Map<BenchmarkSpec, Server>();
  const promises = [];
  for (const {npmInstalls, mountPoints, specs} of plans) {
    promises.push(...npmInstalls.map(
        (install) => prepareVersionDirectory(
            install,
            config.forceCleanNpmInstall,
            )));
    promises.push((async () => {
      const server = await Server.start({
        host: opts.host,
        ports: opts.port,
        root: config.root,
        mountPoints,
        resolveBareModules: config.resolveBareModules,
      });
      for (const spec of specs) {
        servers.set(spec, server);
      }
    })());
  }
  await Promise.all(promises);

  if (config.mode === 'manual') {
    await manualMode(config, servers);
  } else {
    try {
      return await automaticMode(config, servers);
    } finally {
      const allServers = new Set<Server>([...servers.values()]);
      await Promise.all([...allServers].map((server) => server.close()));
    }
  }
}

type ServerMap = Map<BenchmarkSpec, Server>;

function specUrl(
    spec: BenchmarkSpec, servers: ServerMap, config: Config): string {
  if (spec.url.kind === 'remote') {
    return spec.url.url;
  }
  const server = servers.get(spec);
  if (server === undefined) {
    throw new Error('Internal error: no server for spec');
  }
  if (config.remoteAccessibleHost !== '' &&
      spec.browser.remoteUrl !== undefined) {
    return 'http://' + config.remoteAccessibleHost + ':' + server.port +
        spec.url.urlPath + spec.url.queryString;
  }
  return server.url + spec.url.urlPath + spec.url.queryString;
}

/**
 * Let the user run benchmarks manually. This process will not exit until
 * the user sends a termination signal.
 */
async function manualMode(config: Config, servers: ServerMap) {
  if (config.savePath) {
    throw new Error(`Can't save results in manual mode`);
  }

  console.log('\nVisit these URLs in any browser:');
  const allServers = new Set<Server>([...servers.values()]);
  for (const spec of config.benchmarks) {
    console.log();
    if (spec.url.kind === 'local') {
      console.log(
          `${spec.name}${spec.url.queryString}` +
          (spec.url.version !== undefined ? ` [@${spec.url.version.label}]` :
                                            ''));
    }
    console.log(ansi.format(`[yellow]{${specUrl(spec, servers, config)}}`));
  }

  console.log(`\nResults will appear below:\n`);
  for (const server of [...allServers]) {
    (async function() {
      while (true) {
        const result = await server.nextResults();
        server.endSession();
        console.log(`${result.millis.toFixed(3)} ms`);
      }
    })();
  }
}

interface Browser {
  name: string;
  driver: webdriver.WebDriver;
  initialTabHandle: string;
}

async function automaticMode(config: Config, servers: ServerMap):
    Promise<Array<ResultStatsWithDifferences>|undefined> {
  let reportGitHubCheckResults;
  if (config.githubCheck !== undefined) {
    const {label, appId, installationId, repo, commit} = config.githubCheck;

    // We can directly store our GitHub App private key as a secret Travis
    // environment variable (as opposed to committing it as a file and
    // configuring to Travis decrypt it), but we have to be careful with the
    // spaces and newlines that PEM files have, since Travis does a raw Bash
    // substitution when it sets the variable.
    //
    // Given a PEM file from GitHub, the following command will escape spaces
    // and newlines so that it can be safely pasted into the Travis UI. The
    // spaces will get unescaped by Bash, and we'll unescape newlines ourselves.
    //
    //     cat <GITHUB_PEM_FILE>.pem \
    //         | awk '{printf "%s\\\\n", $0}' | sed 's/ /\\ /g'
    const appPrivateKey =
        (process.env.GITHUB_APP_PRIVATE_KEY || '').trim().replace(/\\n/g, '\n');
    if (appPrivateKey === '') {
      throw new Error(
          'Missing or empty GITHUB_APP_PRIVATE_KEY environment variable, ' +
          'which is required when using --github-check.');
    }
    const appToken = github.getAppToken(appId, appPrivateKey);
    const installationToken =
        await github.getInstallationToken({installationId, appToken});

    // Create the initial Check Run run now, so that it will show up in the
    // GitHub UI as pending.
    const checkId =
        await github.createCheckRun({label, repo, commit, installationToken});

    // We'll call this after we're done to complete the Check Run.
    reportGitHubCheckResults = async ({fixed, unfixed}: AutomaticResults) => {
      const markdown = horizontalHtmlResultTable(fixed) + '\n' +
          verticalHtmlResultTable(unfixed);
      await github.completeCheckRun(
          {label, repo, installationToken, checkId, markdown});
    };
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
    while (true) {
      if (horizonsResolved(makeResults(), config.horizons)) {
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

  if (config.savePath) {
    const session = await makeSession(withDifferences.map((s) => s.result));
    await fsExtra.writeJSON(config.savePath, session);
  }

  if (reportGitHubCheckResults !== undefined) {
    await reportGitHubCheckResults({fixed, unfixed});
  }

  return withDifferences;
}

/** Parse horizon flags into signed horizon values. */
export function parseHorizons(strs: string[]): Horizons {
  const absolute = new Set<number>();
  const relative = new Set<number>();
  for (const str of strs) {
    if (!str.match(/^[-+]?(\d*\.)?\d+(ms|%)$/)) {
      throw new Error(`Invalid horizon ${str}`);
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
