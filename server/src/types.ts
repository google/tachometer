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

export class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (error: Error) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

/** The expected format of a benchmarks.json configuration file. */
export interface ConfigFormat {
  variants?: Array<{
    name?: string,
    config?: {},
  }>;
}

/**
 * The descriptor of a package version as specified by the --package-version
 * flag.
 */
export interface PackageVersion {
  label: string;
  dependencies: {[pkg: string]: string};
}

/** A subset of the format of an NPM package.json file. */
export interface PackageJson {
  name: string;
  dependencies: {[pkg: string]: string};
}

/** A specification of a benchmark to run. */
export interface BenchmarkSpec {
  name: string;
  implementation: string;
  version: PackageVersion;
  variant: string;
  config: {};
}

// Note: sync with client/src/index.ts
export interface BenchmarkResponse {
  runId?: string;
  urlPath: string;
  variant: string;
  millis: number;
}

export interface BenchmarkResult {
  runId: string|undefined;
  name: string;
  implementation: string;
  version: PackageVersion;
  variant: string;
  // Millisecond interval between bench.start() and bench.stop().
  millis: number[];
  // Millisecond interval between bench.start() and the end of the first paint
  // which occurs after bench.stop()
  paintMillis: number[];
  browser: {name: string, version: string};
}

export interface PendingBenchmark {
  id: string;
  spec: BenchmarkSpec;
  deferred: Deferred<BenchmarkResult>;
}

export interface BenchmarkSession {
  benchmarks: BenchmarkResult[];
  datetime: string;  // YYYY-MM-DDTHH:mm:ss.sssZ
  system: {
    cpu: {
      manufacturer: string,
      model: string,
      family: string,
      speed: string,
      cores: number,
    };
    load: {
      average: number,
      current: number,
    };
    battery: {
      hasBattery: boolean,
      connected: boolean,
    };
    memory: {
      total: number,
      free: number,
      used: number,
      active: number,
      available: number,
    };
  };
}
