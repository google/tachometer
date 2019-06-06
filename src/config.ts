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

import * as jsonschema from 'jsonschema';
import * as path from 'path';

import {Browser} from './browser';
import {parseHorizons} from './cli';
import {CheckConfig} from './github';
import {isUrl} from './specs';
import {Horizons} from './stats';
import {BenchmarkSpec, Measurement, PackageDependencyMap} from './types';
import {fileKind} from './versions';

/**
 * Expected format of the top-level JSON config file. Note this interface is
 * used to generate the JSON schema for validation.
 */
export interface ConfigFile {
  root?: string;

  /**
   * @TJS-type integer
   * @TJS-minimum 2
   */
  sampleSize?: number;

  /**
   * @TJS-minimum 0
   */
  timeout?: number;

  autoSampleConditions?: string[];

  /** @TJS-minItems 1 */
  benchmarks: ConfigFileBenchmark[];
}

/**
 * Expected format of a benchmark in a JSON config file.
 */
interface ConfigFileBenchmark {
  url?: string;
  name?: string;
  browser?: Browser;
  measurement?: Measurement;
  expand?: ConfigFileBenchmark[];
  packageVersions?: ConfigFilePackageVersion;
}

interface ConfigFilePackageVersion {
  label: string;
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
  autoSampleConditions: Horizons;
  mode: 'automatic'|'manual';
  savePath: string;
  githubCheck?: CheckConfig;
}

/**
 * Validate the given JSON object parsed from a config file, and expand it into
 * a fully specified configuration.
 */
export async function parseConfigFile(parsedJson: unknown): Promise<Config> {
  const schema = require('./config.schema.json');
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
    sampleSize: validated.sampleSize === undefined ? 50 : validated.sampleSize,
    timeout: validated.timeout === undefined ? 3 : validated.timeout,
    autoSampleConditions:
        parseHorizons(validated.autoSampleConditions || ['0%']),
    benchmarks,

    // These are only controlled by flags currently.
    mode: 'automatic',
    savePath: '',
  };
}

async function parseBenchmark(benchmark: ConfigFileBenchmark, root: string):
    Promise<Partial<BenchmarkSpec>> {
  const spec: Partial<BenchmarkSpec> = {};

  if (benchmark.name !== undefined) {
    spec.name = benchmark.name;
  }
  if (benchmark.browser !== undefined) {
    spec.browser = benchmark.browser;
  }
  if (benchmark.measurement !== undefined) {
    spec.measurement = benchmark.measurement;
  }

  const url = benchmark.url;
  if (url !== undefined) {
    if (isUrl(url)) {
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
    if (measurement === undefined) {
      measurement = 'fcp';
    }
  } else {
    if (name === undefined) {
      name = url.urlPath + url.queryString;
    }
    if (measurement === undefined) {
      measurement = 'callback';
    }
  }
  if (browser === undefined) {
    browser = 'chrome';
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
