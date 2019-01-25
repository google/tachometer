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

/** A specification of a benchmark to run. */
export interface BenchmarkSpec {
  name: string;
  implementation: string;
  trials: number;
}

// Note: sync with client/src/index.ts
export interface BenchmarkResponse {
  runId?: string;
  urlPath: string;
  millis: number[];
}

export interface BenchmarkResult {
  runId: string|undefined;
  name: string;
  implementation: string;
  millis: number[];
  browser: {name: string, version: string};
}

export interface PendingBenchmark {
  id: string;
  spec: BenchmarkSpec;
  deferred: Deferred<BenchmarkResult>;
}

export interface BenchmarkSession {
  benchmarks: BenchmarkResult[];
  date: Date;
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
