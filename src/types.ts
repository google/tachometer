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

import {BrowserConfig} from './browser';

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

/**
 * A mapping from NPM package name to version specifier, as used in a
 * package.json's "dependencies" and "devDependencies".
 */
export interface PackageDependencyMap {
  [pkg: string]: string|GitDependency;
}

/**
 * Configuration for cloning a Git repo at some ref with an optional package
 * sub-path for monorepos, for use as an NPM dependency.
 */
export interface GitDependency {
  kind: 'git';
  // The git repository to clone. Any valid `git clone <repository>` argument
  // (e.g. "git@github.com:webcomponents/polyfills.git").
  repo: string;
  // The branch, tag, or SHA to checkout (e.g. "master", "my-feature").
  ref: string;
  // For monorepos or other unusual file layouts, the path relative to the root
  // of the git repo where the "package.json" for the appropriate package can be
  // found (e.g. "packages/shadycss").
  subdir?: string;
  // Install, bootstrap, build, etc. commands to run before installing this
  // package as a dependency (e.g. ["npm install", "npm run build"]).
  setupCommands?: string[];
}

/**
 * The descriptor of a package version as specified by the --package-version
 * flag.
 */
export interface PackageVersion {
  label: string;
  dependencyOverrides: PackageDependencyMap;
}

/** The subset of the format of an NPM package.json file we care about. */
export interface NpmPackageJson {
  private: boolean;
  dependencies: PackageDependencyMap;
}

/** The kinds of intervals we can measure. */
export type Measurement =
    CallbackMeasurement|PerformanceEntryMeasurement|ExpressionMeasurement;

export interface MeasurementBase {
  name?: string;
}

export interface CallbackMeasurement extends MeasurementBase {
  mode: 'callback';
}

export interface PerformanceEntryMeasurement extends MeasurementBase {
  mode: 'performance';
  entryName: string;
}

export interface ExpressionMeasurement extends MeasurementBase {
  mode: 'expression';
  expression: string;
}

export type CommandLineMeasurements = 'callback'|'fcp'|'global';

export const measurements = new Set<string>(['callback', 'fcp', 'global']);

/** A specification of a benchmark to run. */
export interface BenchmarkSpec {
  url: LocalUrl|RemoteUrl;
  measurement: Measurement[];
  name: string;
  browser: BrowserConfig;
}

export interface LocalUrl {
  kind: 'local';
  version?: PackageVersion;
  urlPath: string;
  queryString: string;
}

export interface RemoteUrl {
  kind: 'remote';
  url: string;
}

// Note: sync with client/src/index.ts
export interface BenchmarkResponse {
  millis: number;
}

/**
 * Benchmark results for a particular measurement on a particular page, across
 * all samples.
 */
export interface BenchmarkResult {
  /**
   * Label for this result. When there is more than one per page, this will
   * contain both the page and measurement labels as "page [measurement]".
   */
  name: string;
  /**
   * The measurement that produced this result
   */
  measurement: Measurement;
  /**
   * A single page can return multiple measurements. The offset into the array
   * of measurements in the spec that this particular result corresponds to.
   */
  measurementIndex: number;
  /**
   * Millisecond measurements for each sample.
   */
  millis: number[];
  queryString: string;
  version: string;
  browser: BrowserConfig;
  userAgent: string;
  bytesSent: number;
}
