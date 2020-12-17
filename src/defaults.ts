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

import * as path from 'path';
import {BrowserName} from './browser';
import {LocalUrl, Measurement, RemoteUrl} from './types';

export const windowWidth = 1024;
export const windowHeight = 768;
export const root = '.';
export const browserName: BrowserName = 'chrome';
export const headless = false;
export const sampleSize = 50;
export const timeout = 3;
export const horizons = ['0%'] as const;
export const mode = 'automatic';
export const resolveBareModules = true;
export const forceCleanNpmInstall = false;
export const measurementExpression = 'window.tachometerResult';
export const traceLogDir = path.join(process.cwd(), 'logs');
export const traceCategories = [
  'blink',
  'blink.user_timing',
  'v8',
  'v8.execute',
  'disabled-by-default-v8.compile',
  // Seems to cause errors in about:tracing
  // "disabled-by-default-v8.cpu_profiler",
  'disabled-by-default-v8.gc',
  // "disabled-by-default-v8.gc_stats",
  // ? Not sure what this outputs...
  // "disabled-by-default-v8.ic_stats",
  // "disabled-by-default-v8.runtime_stats",
  'disabled-by-default-v8.turbofan',
];

export function measurement(url: LocalUrl|RemoteUrl): Measurement {
  if (url.kind === 'remote') {
    return {
      mode: 'performance',
      entryName: 'first-contentful-paint',
    };
  }
  return {mode: 'callback'};
}
