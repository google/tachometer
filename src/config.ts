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
import * as path from 'path';

import {BrowserConfig, BrowserName, parseBrowserConfigString, validateBrowserConfig} from './browser';
import {parseHorizons} from './cli';
import {CheckConfig} from './github';
import {Horizons} from './stats';
import {BenchmarkSpec, LocalUrl, Measurement, PackageDependencyMap, RemoteUrl} from './types';
import {isHttpUrl} from './util';
import {fileKind} from './versions';

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
   * local paths (e.g. "my/benchmark.html?foo=bar").
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
   */
  measurement?: Measurement;

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
  headless?: boolean;
  windowSize?: WindowSize;
}

interface FirefoxConfig extends BrowserConfigBase {
  name: 'firefox';
  headless?: boolean;
  windowSize?: WindowSize;
}

interface SafariConfig extends BrowserConfigBase {
  name: 'safari';
  headless?: boolean;
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
 * Validated and fully specified configuration.
 */
export interface Config {
  root: string;
  sampleSize: number;
  timeout: number;
  benchmarks: BenchmarkSpec[];
  horizons: Horizons;
  mode: 'automatic'|'manual';
  savePath: string;
  githubCheck?: CheckConfig;
  resolveBareModules: boolean;
  remoteAccessibleHost: string;
}

export const defaultRoot = '.';
export const defaultBrowserName: BrowserName = 'chrome';
export const defaultSampleSize = 50;
export const defaultTimeout = 3;
export const defaultHorizons = ['0%'];

export function defaultMeasurement(url: LocalUrl|RemoteUrl): Measurement {
  if (url.kind === 'remote') {
    return 'fcp';
  }
  return 'callback';
}

/**
 * Validate the given JSON object parsed from a config file, and expand it into
 * a fully specified configuration.
 */
export async function parseConfigFile(parsedJson: unknown): Promise<Config> {
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
    sampleSize: validated.sampleSize !== undefined ? validated.sampleSize :
                                                     defaultSampleSize,
    timeout: validated.timeout !== undefined ? validated.timeout :
                                               defaultTimeout,
    horizons: parseHorizons(validated.horizons || defaultHorizons),
    benchmarks,
    resolveBareModules: validated.resolveBareModules === undefined ?
        true :
        validated.resolveBareModules,

    // These are only controlled by flags currently.
    mode: 'automatic',
    savePath: '',
    remoteAccessibleHost: '',
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
      name: defaultBrowserName,
      headless: false,
      windowSize: {
        width: defaultWindowWidth,
        height: defaultWindowHeight,
      },
    };
  }
  if (measurement === undefined) {
    measurement = defaultMeasurement(url);
  }
  return {name, url, browser, measurement};
}

/**
 * Derives the URL that we'll use to benchmark using the given HTML file or
 * directory on disk, relative to the root directory we'll be serving. Throws if
 * it's a file that doesn't exist, or a directory without an index.html.
 */
export async function urlFromLocalPath(
    rootDir: string, diskPath: string): Promise<string> {
  const serverRelativePath = path.relative(rootDir, diskPath);
  // TODO Test on Windows.
  if (serverRelativePath.startsWith('..')) {
    throw new Error(
        'File or directory is not accessible from server root: ' + diskPath);
  }

  const kind = await fileKind(diskPath);
  if (kind === undefined) {
    throw new Error(`No such file or directory: ${diskPath}`);
  }

  // TODO Test on Windows.
  let urlPath = `/${serverRelativePath.replace(path.win32.sep, '/')}`;
  if (kind === 'dir') {
    if (await fileKind(path.join(diskPath, 'index.html')) !== 'file') {
      throw new Error(`Directory did not contain an index.html: ${diskPath}`);
    }
    // We need a trailing slash when serving a directory. Our static server
    // will serve index.html at both /foo and /foo/, without redirects. But
    // these two forms will have baseURIs that resolve relative URLs
    // differently, and we want the form that would work the same as
    // /foo/index.html.
    urlPath += '/';
  }
  return urlPath;
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
