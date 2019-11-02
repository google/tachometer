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
import * as jsonschema from 'jsonschema';

import {BrowserConfig, BrowserName, parseBrowserConfigString, validateBrowserConfig} from './browser';
import {Config, parseHorizons, urlFromLocalPath} from './config';
import * as defaults from './defaults';
import {BenchmarkSpec, Measurement, PackageDependencyMap} from './types';
import {isHttpUrl} from './util';

/**
 * Expected format of the top-level JSON config file. Note this interface is
 * used to generate the JSON schema for validation.
 */
export interface ConfigFile {
  /**
   * Root directory to serve benchmarks from (default current directory).
   */
  root?: string;

  /**
   * Minimum number of times to run each benchmark (default 50).
   * @TJS-type integer
   * @TJS-minimum 2
   */
  sampleSize?: number;

  /**
   * The maximum number of minutes to spend auto-sampling (default 3).
   * @TJS-minimum 0
   */
  timeout?: number;

  /**
   * The degrees of difference to try and resolve when auto-sampling
   * (e.g. 0ms, +1ms, -1ms, 0%, +1%, -1%, default 0%).
   */
  horizons?: string[];

  /**
   * Benchmarks to run.
   * @TJS-minItems 1
   */
  benchmarks: ConfigFileBenchmark[];

  /**
   * Whether to automatically convert ES module imports with bare module
   * specifiers to paths.
   */
  resolveBareModules?: boolean;

  /**
   * An optional reference to the JSON Schema for this file.
   *
   * If none is given, and the file is a valid tachometer config file,
   * tachometer will write back to the config file to give this a value.
   */
  $schema?: string;
}

/**
 * Expected format of a benchmark in a JSON config file.
 */
interface ConfigFileBenchmark {
  /**
   * A fully qualified URL, or a local path to an HTML file or directory. If a
   * directory, must contain an index.html. Query parameters are permitted on
   * local paths (e.g. 'my/benchmark.html?foo=bar').
   */
  url?: string;

  /**
   * An optional label for this benchmark. Defaults to the URL.
   */
  name?: string;

  /**
   * Which browser to run the benchmark in.
   *
   * Options:
   *   - chrome (default)
   *   - chrome-headless
   *   - firefox
   *   - firefox-headless
   *   - safari
   *   - edge
   *   - ie
   */
  browser?: string|BrowserConfigs;

  /**
   * Which time interval to measure.
   *
   * Options:
   *   - callback: bench.start() to bench.stop() (default for fully qualified
   *     URLs.
   *   - fcp: first contentful paint (default for local paths)
   *   - global: result returned from window.tachometerResult (or custom
   *       expression set via globalMeasurementExpression)
   */
  measurement?: Measurement;

  /**
   * Expression to use to retrieve global result.  Defaults to
   * `window.tachometerResult`.
   */
  globalMeasurementExpression?: string;

  /**
   * Optional NPM dependency overrides to apply and install. Only supported with
   * local paths.
   */
  packageVersions?: ConfigFilePackageVersion;

  /**
   * Recursively expand this benchmark configuration with any number of
   * variations. Useful for testing the same base configuration with e.g.
   * multiple browers or package versions.
   */
  expand?: ConfigFileBenchmark[];
}

type BrowserConfigs =
    ChromeConfig|FirefoxConfig|SafariConfig|EdgeConfig|IEConfig;

interface BrowserConfigBase {
  /**
   * Name of the browser:
   *
   * Options:
   *   - chrome
   *   - firefox
   *   - safari
   *   - edge
   *   - ie
   */
  name: BrowserName;

  /**
   * A remote WebDriver server HTTP address to launch the browser from.
   */
  remoteUrl?: string;

  /**
   * The size of new windows created from this browser. Defaults to 1024x768.
   */
  windowSize?: WindowSize;
}

interface WindowSize {
  /**
   * Width of the browser window in pixels.
   *
   * @TJS-type integer
   * @TJS-minimum 0
   */
  width: number;

  /**
   * Height of the browser window in pixels.
   *
   * @TJS-type integer
   * @TJS-minimum 0
   */
  height: number;
}

export const defaultWindowWidth = 1024;
export const defaultWindowHeight = 768;

interface ChromeConfig extends BrowserConfigBase {
  name: 'chrome';

  /**
   * Whether to launch the headless (no GUI) version of this browser.
   */
  headless?: boolean;

  /**
   * Path to the binary to use when launching this browser, instead of the
   * default one.
   */
  binary?: string;

  /**
   * Additional command-line arguments to pass when launching the browser.
   */
  addArguments?: string[];

  /**
   * Command-line arguments that WebDriver normally adds by default when
   * launching the browser, which you would like to omit.
   */
  removeArguments?: string[];
}

interface FirefoxConfig extends BrowserConfigBase {
  name: 'firefox';

  /**
   * Whether to launch the headless (no GUI) version of this browser.
   */
  headless?: boolean;

  /**
   * Path to the binary to use when launching this browser, instead of the
   * default one.
   */
  binary?: string;

  /**
   * Additional command-line arguments to pass when launching the browser.
   */
  addArguments?: string[];
}

interface SafariConfig extends BrowserConfigBase {
  name: 'safari';
}

interface EdgeConfig extends BrowserConfigBase {
  name: 'edge';
}

interface IEConfig extends BrowserConfigBase {
  name: 'ie';
}

interface ConfigFilePackageVersion {
  /**
   * Required label to identify this version map.
   */
  label: string;

  /**
   * Map from NPM package to version. Any version syntax supported by NPM is
   * supported here.
   */
  dependencies: PackageDependencyMap;
}

/**
 * Validate the given JSON object parsed from a config file, and expand it into
 * a fully specified configuration.
 */
export async function parseConfigFile(parsedJson: unknown):
    Promise<Partial<Config>> {
  const schema = require('../config.schema.json');
  const result =
      jsonschema.validate(parsedJson, schema, {propertyName: 'config'});
  if (result.errors.length > 0) {
    throw new Error(result.errors[0].toString());
  }
  const validated = parsedJson as ConfigFile;
  const root = validated.root || '.';
  const benchmarks: BenchmarkSpec[] = [];
  for (const benchmark of validated.benchmarks) {
    for (const expanded of applyExpansions(benchmark)) {
      benchmarks.push(applyDefaults(await parseBenchmark(expanded, root)));
    }
  }

  return {
    root,
    sampleSize: validated.sampleSize,
    timeout: validated.timeout,
    horizons: validated.horizons !== undefined ?
        parseHorizons(validated.horizons) :
        undefined,
    benchmarks,
    resolveBareModules: validated.resolveBareModules,
  };
}

async function parseBenchmark(benchmark: ConfigFileBenchmark, root: string):
    Promise<Partial<BenchmarkSpec>> {
  const spec: Partial<BenchmarkSpec> = {};

  if (benchmark.name !== undefined) {
    spec.name = benchmark.name;
  }

  if (benchmark.browser !== undefined) {
    let browser;
    if (typeof benchmark.browser === 'string') {
      browser = {
        ...parseBrowserConfigString(benchmark.browser),
        windowSize: {
          width: defaultWindowWidth,
          height: defaultWindowHeight,
        },
      };
    } else {
      browser = parseBrowserObject(benchmark.browser);
    }
    validateBrowserConfig(browser);
    spec.browser = browser;
  }

  if (benchmark.measurement !== undefined) {
    spec.measurement = benchmark.measurement;
  }
  if (spec.measurement === 'global' &&
      benchmark.globalMeasurementExpression !== undefined) {
    spec.globalMeasurementExpression = benchmark.globalMeasurementExpression;
  }

  const url = benchmark.url;
  if (url !== undefined) {
    if (isHttpUrl(url)) {
      spec.url = {
        kind: 'remote',
        url,
      };
    } else {
      let urlPath, queryString;
      const q = url.indexOf('?');
      if (q !== -1) {
        urlPath = url.substring(0, q);
        queryString = url.substring(q);
      } else {
        urlPath = url;
        queryString = '';
      }

      spec.url = {
        kind: 'local',
        urlPath: await urlFromLocalPath(root, urlPath),
        queryString,
      };

      if (benchmark.packageVersions !== undefined) {
        spec.url.version = {
          label: benchmark.packageVersions.label,
          dependencyOverrides: benchmark.packageVersions.dependencies,
        };
      }
    }
  }

  return spec;
}

function parseBrowserObject(config: BrowserConfigs): BrowserConfig {
  const parsed: BrowserConfig = {
    name: config.name,
    headless: ('headless' in config && config.headless) || false,
    windowSize: ('windowSize' in config && config.windowSize) || {
      width: defaultWindowWidth,
      height: defaultWindowHeight,
    },
  };
  if (config.remoteUrl) {
    parsed.remoteUrl = config.remoteUrl;
  }
  if ('binary' in config && config.binary) {
    parsed.binary = config.binary;
  }
  if ('addArguments' in config && config.addArguments) {
    parsed.addArguments = config.addArguments;
  }
  if ('removeArguments' in config && config.removeArguments) {
    parsed.removeArguments = config.removeArguments;
  }
  return parsed;
}

function applyExpansions(bench: ConfigFileBenchmark): ConfigFileBenchmark[] {
  if (bench.expand === undefined || bench.expand.length === 0) {
    return [bench];
  }
  const expanded = [];
  for (const expansion of bench.expand) {
    for (const expandedBench of applyExpansions(expansion)) {
      expanded.push({
        ...bench,
        ...expandedBench,
      });
    }
  }
  return expanded;
}

function applyDefaults(partialSpec: Partial<BenchmarkSpec>): BenchmarkSpec {
  const url = partialSpec.url;
  let {name, measurement, browser} = partialSpec;
  if (url === undefined) {
    // Note we can't validate this with jsonschema, because we only need to
    // ensure we have a URL after recursive expansion; so at any given level
    // the URL could be optional.
    throw new Error('No URL specified');
  }
  if (url.kind === 'remote') {
    if (name === undefined) {
      name = url.url;
    }
  } else {
    if (name === undefined) {
      name = url.urlPath + url.queryString;
    }
  }
  if (browser === undefined) {
    browser = {
      name: defaults.browserName,
      headless: false,
      windowSize: {
        width: defaultWindowWidth,
        height: defaultWindowHeight,
      },
    };
  }
  if (measurement === undefined) {
    measurement = defaults.measurement(url);
  }
  const spec: BenchmarkSpec = {name, url, browser, measurement};
  if (measurement === 'global' &&
      partialSpec.globalMeasurementExpression === undefined) {
    spec.globalMeasurementExpression = defaults.globalMeasurementExpression;
  }
  return spec;
}

export async function writeBackSchemaIfNeeded(
    rawConfigObj: Partial<ConfigFile>, configFile: string) {
  // Add the $schema field to the original config file if it's absent.
  // We only want to do this if the file validated though, so we don't mutate
  // a file that's not actually a tachometer config file.
  if (!('$schema' in rawConfigObj)) {
    const $schema =
        'https://raw.githubusercontent.com/Polymer/tachometer/master/config.schema.json';
    // Extra IDE features can be activated if the config file has a schema.
    const withSchema = {
      $schema,
      ...rawConfigObj,
    };
    const contents = JSON.stringify(withSchema, null, 2);
    await fsExtra.writeFile(configFile, contents, {encoding: 'utf-8'});
  }
}
