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

import {isBrowser} from './browser';
import {isUrl} from './specs';
import {BenchmarkSpec, isMeasurement} from './types';

export interface Config {
  root: string;
  benchmarks: BenchmarkSpec[];
}

export function parseConfig(raw: unknown): Config {
  if (!(raw instanceof Object)) {
    throw new Error(`Invalid config format`);
  }

  let root = '.';
  const rawBenchmarks = [];
  for (const [key, val] of Object.entries(raw)) {
    if (key === 'root' && val) {
      root = val;

    } else if (key === 'benchmarks') {
      if (val instanceof Array) {
        rawBenchmarks.push(...val);
      } else {
        throw new Error(`benchmarks must be an array: ${val}`);
      }

    } else {
      throw new Error(`Unknown config key: ${key}`);
    }
  }

  if (rawBenchmarks.length === 0) {
    throw new Error('At least one benchmark is required');
  }
  const benchmarks: BenchmarkSpec[] = [];
  for (const rawBenchmark of rawBenchmarks) {
    for (const partial of parseRawBenchmark(rawBenchmark)) {
      benchmarks.push(applyDefaults(partial));
    }
  }

  return {root, benchmarks};
}

function parseRawBenchmark(raw: unknown): Array<Partial<BenchmarkSpec>> {
  if (!(raw instanceof Object)) {
    throw new Error(`Benchmark must be an object`);
  }

  const parsed: Partial<BenchmarkSpec> = {};
  const expansions = [];
  for (const [key, val] of Object.entries(raw)) {
    if (key === 'name' && val) {
      parsed.name = String(val);

    } else if (key === 'url' && val) {
      if (typeof val !== 'string') {
        throw new Error('url must be string');
      }

      if (isUrl(val)) {
        parsed.url = {
          kind: 'remote',
          url: val,
        };
      } else {
        let urlPath, queryString;
        const q = val.indexOf('?');
        if (q !== -1) {
          urlPath = val.substring(0, q);
          queryString = val.substring(q);
        } else {
          urlPath = val;
          queryString = '';
        }

        parsed.url = {
          kind: 'local',
          urlPath,
          queryString,
          // TODO
          version: {
            label: 'default',
            dependencyOverrides: {},
          },
        };
      }

    } else if (key === 'browser' && val) {
      if (isBrowser(val)) {
        parsed.browser = val;
      } else {
        throw new Error(`Browser not supported: ${val}`);
      }

    } else if (key === 'measurement' && val) {
      if (isMeasurement(val)) {
        parsed.measurement = val;
      } else {
        throw new Error(`Invalid measurement: ${val}`);
      }

    } else if (key === 'expand') {
      if (val instanceof Array) {
        expansions.push(...val);
      } else {
        throw new Error(`expand must be an array`);
      }

    } else {
      throw new Error(`Unknown config key: ${key}`);
    }
  }

  if (expansions.length > 0) {
    const expanded = [];
    for (const expansion of expansions) {
      for (const parsedExpansion of parseRawBenchmark(expansion)) {
        expanded.push({
          ...parsed,
          ...parsedExpansion,
        });
      }
    }
    return expanded;

  } else {
    return [parsed];
  }
}

function applyDefaults(partial: Partial<BenchmarkSpec>): BenchmarkSpec {
  const url = partial.url;
  if (url === undefined) {
    throw new Error('No URL specified');
  }
  let name = partial.name;
  let measurement = partial.measurement;
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
  let browser = 'chrome';
  if (partial.browser !== undefined) {
    browser = partial.browser;
  }
  return {name, url, browser, measurement};
}
