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
import * as os from 'os';

import commandLineArgs = require('command-line-args');
import commandLineUsage = require('command-line-usage');
import ProgressBar = require('progress');
import ansi = require('ansi-escape-sequences');

import {makeSession} from './session';
import {validBrowsers, fcpBrowsers, makeDriver, openAndSwitchToNewTab, pollForFirstContentfulPaint} from './browser';
import {BenchmarkResult, BenchmarkSpec, Measurement} from './types';
import {Server} from './server';
import {Horizons, ResultStats, horizonsResolved, summaryStats, computeDifferences} from './stats';
import {specsFromOpts} from './specs';
import {AutomaticResults, verticalTermResultTable, horizontalTermResultTable, verticalHtmlResultTable, horizontalHtmlResultTable, automaticResultTable, spinner} from './format';
import {prepareVersionDirectory, makeServerPlans} from './versions';
import {parseConfigFile, Config, defaultRoot, defaultBrowser, defaultSampleSize, defaultTimeout, defaultHorizons, writeBackSchemaIfNeeded} from './config';
import * as github from './github';

const defaultInstallDir = path.join(os.tmpdir(), 'tachometer', 'versions');

export const optDefs: commandLineUsage.OptionDefinition[] = [
  {
    name: 'help',
    description: 'Show documentation',
    type: Boolean,
    defaultValue: false,
  },
  {
    name: 'version',
    description: 'Show the installed version of tachometer',
    type: Boolean,
    defaultValue: false,
  },
  {
    name: 'root',
    description:
        `Root directory to search for benchmarks (default ${defaultRoot})`,
    type: String,
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
    name: 'config',
    description: 'Path to JSON config file (see README for format)',
    type: String,
    defaultValue: '',
  },
  {
    name: 'package-version',
    description: 'Specify an NPM package version to swap in (see README)',
    alias: 'p',
    type: String,
    defaultValue: [],
    lazyMultiple: true,
  },
  {
    name: 'npm-install-dir',
    description: `Where to install custom package versions ` +
        `(default ${defaultInstallDir})`,
    type: String,
    defaultValue: defaultInstallDir,
  },
  {
    name: 'browser',
    description: 'Which browsers to launch in automatic mode, ' +
        `comma-delimited (${[...validBrowsers].join(', ')}) ` +
        `(default ${defaultBrowser})`,
    alias: 'b',
    type: String,
  },
  {
    name: 'sample-size',
    description: 'Minimum number of times to run each benchmark' +
        ` (default ${defaultSampleSize})`,
    alias: 'n',
    type: Number,
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
    name: 'measure',
    description: 'Which time interval to measure. Options:\n' +
        '* callback: bench.start() to bench.stop() (default)\n' +
        '*      fcp: first contentful paint',
    type: (str: string): string => {
      if (str !== 'callback' && str !== 'fcp') {
        throw new Error(
            `Expected --measure flag to be "callback" or "fcp" ` +
            `but was "${str}"`);
      }
      return str;
    },
  },
  {
    name: 'horizon',
    description:
        'The degrees of difference to try and resolve when auto-sampling ' +
        '(milliseconds, comma-delimited, optionally signed, ' +
        `default ${defaultHorizons.join(',')})`,
    type: String,
  },
  {
    name: 'timeout',
    description: 'The maximum number of minutes to spend auto-sampling ' +
        `(default ${defaultTimeout}).`,
    type: Number,
  },
  {
    name: 'github-check',
    description: 'Post benchmark results as a GitHub Check. A JSON object ' +
        'with properties appId, installationId, repo, and commit.',
    type: String,
    defaultValue: '',
  },
  {
    name: 'resolve-bare-modules',
    description: 'Whether to automatically convert ES module imports with ' +
        'bare module specifiers to paths.',
    type: booleanString,
  },
];

/**
 * Boolean flags that default to true are not supported
 * (https://github.com/75lb/command-line-args/issues/71).
 */
function booleanString(str: string): boolean {
  if (str === 'true' || str === '') {
    return true;
  } else if (str === 'false') {
    return false;
  }
  throw new Error(`Invalid boolean flag value: ${str}`);
}

export interface Opts {
  help: boolean;
  version: boolean;
  root: string|undefined;
  host: string;
  port: number[];
  config: string;
  'package-version': string[];
  'npm-install-dir': string;
  browser: string|undefined;
  'sample-size': number|undefined;
  manual: boolean;
  save: string;
  measure: Measurement|undefined;
  horizon: string|undefined;
  timeout: number|undefined;
  'github-check': string;
  'resolve-bare-modules': boolean|undefined;

  // Extra arguments not associated with a flag are put here. These are our
  // benchmark names/URLs.
  //
  // Note we could also define a flag and set `defaultOption: true`, but then
  // there would be two ways of specifying benchmark names/URLs. Also note the
  // _unknown property is defined in commandLineArgs.CommandLineOptions, but we
  // don't want to extend that because it includes `[propName: string]: any`.
  _unknown?: string[];
}

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

export async function main() {
  const opts = commandLineArgs(optDefs, {partial: true}) as Opts;

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
    if (!fcpBrowsers.has(spec.browser)) {
      throw new Error(
          `Browser ${spec.browser} does not support the ` +
          `first contentful paint (FCP) measurement`);
    }
  }

  const plans = await makeServerPlans(
      config.root, opts['npm-install-dir'], config.benchmarks);

  const servers = new Map<BenchmarkSpec, Server>();
  const promises = [];
  for (const {npmInstalls, mountPoints, specs} of plans) {
    promises.push(...npmInstalls.map(prepareVersionDirectory));
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
    await automaticMode(config, servers);
  }
}

type ServerMap = Map<BenchmarkSpec, Server>;

function specUrl(spec: BenchmarkSpec, servers: ServerMap): string {
  if (spec.url.kind === 'remote') {
    return spec.url.url;
  }
  const server = servers.get(spec);
  if (server === undefined) {
    throw new Error('Internal error: no server for spec');
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
    console.log(ansi.format(`[yellow]{${specUrl(spec, servers)}}`));
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

async function automaticMode(config: Config, servers: ServerMap) {
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
    //         | awk '{printf "%s\\\\n", $0}' | sed 's/ /\\ // // /g'
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
    total: specs.length * config.sampleSize,
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
    const driver = await makeDriver(browser);
    const tabs = await driver.getAllWindowHandles();
    // We'll always launch new tabs from this initial blank tab.
    const initialTabHandle = tabs[0];
    browsers.set(browser, {name: browser, driver, initialTabHandle});
  }

  const allServers = new Set<Server>([...servers.values()]);
  const specResults = new Map<BenchmarkSpec, BenchmarkResult[]>();
  for (const spec of specs) {
    specResults.set(spec, []);
  }

  const runSpec = async (spec: BenchmarkSpec) => {
    let server;
    if (spec.url.kind === 'local') {
      server = servers.get(spec);
      if (server === undefined) {
        throw new Error('Internal error: no server for spec');
      }
    }

    const url = specUrl(spec, servers);
    const {driver, initialTabHandle} = browsers.get(spec.browser)!;
    await openAndSwitchToNewTab(driver);
    await driver.get(url);

    let millis;
    if (spec.measurement === 'fcp') {
      const fcp = await pollForFirstContentfulPaint(driver);
      if (fcp !== undefined) {
        millis = [fcp];
      } else {
        // This does very occasionally happen, unclear why. By not setting
        // millis here, we'll just exclude this sample from the results.
        console.error(
            `Timed out waiting for first contentful paint from ${url}`);
      }
    } else {
      if (server === undefined) {
        throw new Error('Internal error: no server for spec');
      }
      const result = await server.nextResults();
      millis = [result.millis];
    }
    if (millis !== undefined) {
      let bytesSent = 0;
      let userAgent = '';
      if (server !== undefined) {
        const session = server.endSession();
        bytesSent = session.bytesSent;
        userAgent = session.userAgent;
      }
      const result: BenchmarkResult = {
        name: spec.name,
        queryString: spec.url.kind === 'local' ? spec.url.queryString : '',
        version: spec.url.kind === 'local' && spec.url.version !== undefined ?
            spec.url.version.label :
            '',
        millis,
        bytesSent,
        browser: spec.browser,
        userAgent,
      };
      specResults.get(spec)!.push(result);
    }

    // Close the active tab (but not the whole browser, since the
    // initial blank tab is still open).
    await driver.close();
    await driver.switchTo().window(initialTabHandle);
  };

  // Always collect our minimum number of samples.
  const numRuns = specs.length * config.sampleSize;
  let run = 0;
  for (let sample = 0; sample < config.sampleSize; sample++) {
    for (const spec of specs) {
      bar.tick(0, {
        status: [
          `${++run}/${numRuns}`,
          spec.browser,
          spec.name + (spec.url.kind === 'local' ? spec.url.queryString : ''),
          spec.url.kind === 'local' && spec.url.version !== undefined ?
              `[@${spec.url.version.label}]` :
              '',
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
          await runSpec(spec);
        }
      }
    }
  }

  // Close the browsers by closing each of their last remaining tabs.
  await Promise.all([...browsers.values()].map(({driver}) => driver.close()));
  await Promise.all([...allServers].map((server) => server.close()));

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
