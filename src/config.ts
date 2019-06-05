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

import {Browser} from './browser';
import {isUrl} from './specs';
import {BenchmarkSpec, Measurement, PackageDependencyMap} from './types';

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
  benchmarks: BenchmarkSpec[];
}

/**
 * Validate the given JSON object parsed from a config file, and expand it into
 * a fully specified configuration.
 */
export function parseConfigFile(parsedJson: unknown): Config {
  const schema = require('./config.schema.json');
  const result =
      jsonschema.validate(parsedJson, schema, {propertyName: 'config'});
  if (result.errors.length > 0) {
    throw new Error(result.errors[0].toString());
  }
  const validated = parsedJson as ConfigFile;

  const benchmarks: BenchmarkSpec[] = [];
  for (const benchmark of validated.benchmarks) {
    for (const partial of parseBenchmark(benchmark)) {
      benchmarks.push(applyDefaults(partial));
    }
  }

  return {
    root: validated.root || '.',
    sampleSize: validated.sampleSize || 50,
    benchmarks,
  };
}

function parseBenchmark(benchmark: ConfigFileBenchmark):
    Array<Partial<BenchmarkSpec>> {
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
        urlPath,
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

  if (benchmark.expand !== undefined && benchmark.expand.length > 0) {
    const expanded = [];
    for (const expansion of benchmark.expand) {
      for (const expandedSpec of parseBenchmark(expansion)) {
        expanded.push({
          ...spec,
          ...expandedSpec,
        });
      }
    }
    return expanded;

  } else {
    return [spec];
  }
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
