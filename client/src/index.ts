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

interface BenchmarkInfo {
  name: string;
  run(): Promise<unknown>|unknown;
  runs: number[];
}

const benchmarks: BenchmarkInfo[] = [];

export const registerBenchmark = (name: string, run: () => unknown) => {
  benchmarks.push({name, run, runs: []});
};

const runBenchmarks = async () => {
  console.log(`Running ${benchmarks.length} benchmarks`);
  for (const benchmark of benchmarks) {
    // TODO: run each benchmark multiple times
    const done = new Promise((resolve, reject) => {
      requestAnimationFrame(async () => {
        const start = performance.now();
        try {
          const result = benchmark.run();
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
          benchmark.runs.push(runtime);
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
      id,
      benchmarks: benchmarks.map((b) => ({name: b.name, runs: b.runs})),
    }),
  });
};

const urlParams = new URLSearchParams(window.location.search);
const id = urlParams.get('id');

setTimeout(() => runBenchmarks(), 0);
