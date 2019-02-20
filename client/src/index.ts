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
  millis: number;
}

const url = new URL(window.location.href);
const runId = url.searchParams.get('runId') || undefined;
const variant = url.searchParams.get('variant') || undefined;

export const config = JSON.parse(url.searchParams.get('config') || '{}');

let startTime: number;
export function start() {
  // This gives us a timestamp we can find in the performance logs to compute
  // the interval between now and the end of the paint that may happen after
  // bench.stop() is called.
  console.timeStamp('benchStartCalled');
  startTime = performance.now();
}

export async function stop() {
  const end = performance.now();
  // Wait two RAFs before we indicate that we're done, because if the code that
  // just finished executing triggers a paint, it's probably going to paint on
  // the next frame, and we want to see that in the performance logs.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const runtime = end - startTime;
      const response: BenchmarkResponse = {
        runId,
        variant,
        millis: runtime,
        urlPath: url.pathname,
      };
      fetch('/submitResults', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(response),
      });
    });
  });
}
