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

const url = new URL(window.location.href);
const runId = url.searchParams.get('runId') || undefined;
const numIterations = Number(url.searchParams.get('numIterations')) || 1;

let benchmarkFn: () => Promise<unknown>| unknown;
let iterationMillis: number[];

export const registerBenchmark = (fn: () => unknown) => benchmarkFn = fn;

const runBenchmarks = async () => {
  iterationMillis = [];
  for (let i = 0; i < numIterations; i++) {
    console.log(`Running benchmark ${i + 1}/${numIterations}`);
    const done = new Promise((resolve, reject) => {
      requestAnimationFrame(async () => {
        const start = performance.now();
        try {
          const result = benchmarkFn();
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
          iterationMillis.push(runtime);
          resolve();
        }, 0);
      });
    });
    await done;
  }
  await fetch('/submitResults', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      runId,
      iterationMillis,
      urlPath: url.pathname,
    }),
  });
};

setTimeout(() => runBenchmarks(), 0);
