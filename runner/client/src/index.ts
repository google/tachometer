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
  run(): unknown;
  runs: number[];
}

const benchmarks: BenchmarkInfo[] = [];

export const benchmark = (name: string, run: () => unknown) => {
  benchmarks.push({name, run, runs: []});
};

const runBenchmarks = async () => {
  console.log(`Running ${benchmarks.length} benchmarks`);
  for (const benchmark of benchmarks) {
    // TODO: run each benchmark multiple times
    const start = performance.now();
    const result = benchmark.run();
    if (result && typeof (result as any).then === 'function') {
      await result;
    }
    const end = performance.now();
    const runtime = end - start;
    benchmark.runs.push(runtime);
  }
  socket.send(JSON.stringify({
    type: 'result',
    id,
    benchmarks: benchmarks.map((b) => ({
      name: b.name,
      runs: b.runs,
    }))
  }));
};

const urlParams = new URLSearchParams(window.location.search);
const id = urlParams.get('id');

const base = new URL(document.baseURI!);
let socket!: WebSocket;

try {
  socket = new WebSocket(`ws://${base.host}/test`);
} catch (error) {
  console.error(error);
}

socket.addEventListener('open', () => {
  console.log('Control socket opened');
  socket.send(JSON.stringify({type: 'start', id}));
  runBenchmarks();
});

socket.addEventListener('close', (event) => {
  console.log('Control socket closed', event.code);
});

socket.addEventListener('message', (event) => {
  console.log('Message from server ', event.data);
});

