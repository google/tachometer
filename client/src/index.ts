/**
 * @license
 * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

// Note: sync with server/src/types.ts
interface BenchmarkResponse {
  runId?: string;
  urlPath: string;
  variant?: string;
  millis: number[];
}

const url = new URL(window.location.href);
const runId = url.searchParams.get('runId') || undefined;
const variant = url.searchParams.get('variant') || undefined;
const config = JSON.parse(url.searchParams.get('config') || '{}');

let benchmarkFn: (config?: {}) => Promise<unknown>| unknown;
let millis: number[];

export const registerBenchmark = (fn: () => unknown) => benchmarkFn = fn;

const runBenchmarks = async () => {
  millis = [];
  console.log(`Running benchmark`);
  const done = new Promise((resolve, reject) => {
    requestAnimationFrame(async () => {
      const start = performance.now();
      try {
        const result = benchmarkFn(config);
        if (result instanceof Promise) {
          await result;
        }
      } catch (e) {
        reject(e);
        return;
      }
      setTimeout(() => {
        const end = performance.now();
        const runtime = end - start;
        millis.push(runtime);
        resolve();
      }, 0);
    });
  });
  await done;
  const response: BenchmarkResponse = {
    runId,
    variant,
    millis,
    urlPath: url.pathname,
  };
  await fetch('/submitResults', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(response),
  });
};

setTimeout(() => runBenchmarks(), 0);
