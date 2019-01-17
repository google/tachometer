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

export interface BenchmarkSpec {
  benchmark: string;
  implementation: string;
  urlPath: string;
}

export interface Run {
  id: string;
  spec: BenchmarkSpec;
  deferred: Deferred<BenchmarkResult[]>;
}

export interface BenchmarkResult {
  name: string;
  runs: number[];
}

export interface RunData {
  name: string;
  date: Date;
  benchmarks: BenchmarkResult[];
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
}

export class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (error: Error) => void;

  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }
}
