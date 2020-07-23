/**
 * @license
 * Copyright (c) 2020 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

import * as webdriver from 'selenium-webdriver';

import {Server} from './server';
import {BenchmarkSpec, PerformanceEntryCriteria} from './types';
import {throwUnreachable} from './util';

/**
 * Try to take a measurement in milliseconds from the given browser. Returns
 * undefined if the measurement is not available (which may just mean we need to
 * wait some more time).
 */
export async function measure(
    driver: webdriver.WebDriver,
    {measurement, measurementExpression}: BenchmarkSpec,
    server: Server|undefined): Promise<number|undefined> {
  if (measurement === 'fcp') {
    return queryForPerformanceEntry(driver, {name: 'first-contentful-paint'});
  }
  if (measurement === 'callback') {
    if (server === undefined) {
      throw new Error('Internal error: no server for spec');
    }
    return (await server.nextResults()).millis;
  }
  if (measurement === 'global') {
    if (!measurementExpression) {
      throw new Error('Internal error: no measurement expression');
    }
    return queryForExpression(driver, measurementExpression);
  }
  if (measurement && 'performanceEntry' in measurement) {
    return queryForPerformanceEntry(driver, measurement.performanceEntry);
  }
  throwUnreachable(
      measurement,
      `Internal error: unknown measurement type ` +
          JSON.stringify(measurement));
}

/**
 * https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry
 *
 * Note a more complete interface for this is defined in the standard
 * lib.dom.d.ts, but we don't want to depend on that since it would make all
 * DOM types ambiently defined.
 */
interface PerformanceEntry {
  entryType: 'frame'|'navigation'|'resource'|'mark'|'measure'|'paint'|
      'longtask';
  name: string;
  startTime: number;
  duration: number;
}

/**
 * Query the browser for the Performance Entry matching the given criteria.
 * Returns undefined if no matching entry is found. Throws if the performance
 * entry has an unsupported type. If there are multiple entries matching the
 * same criteria, returns only the first one.
 */
async function queryForPerformanceEntry(
    driver: webdriver.WebDriver,
    criteria: PerformanceEntryCriteria): Promise<number|undefined> {
  const escaped = escapeStringLiteral(criteria.name);
  const script = `return window.performance.getEntriesByName(\`${escaped}\`);`;
  const entries = await driver.executeScript(script) as PerformanceEntry[];
  if (entries.length === 0) {
    return undefined;
  }
  const entry = entries[0];
  switch (entry.entryType) {
    case 'measure':
      return entry.duration;
    case 'mark':
    case 'paint':
      return entry.startTime;
    default:
      // We may want to support other entry types, but we'll need to investigate
      // how to interpret them, and we may need additional criteria to decide
      // which exact numbers to report from them.
      throw new Error(
          `Performance entry type not supported: ${entry.entryType}`);
  }
}

/**
 * Execute the given expression in the browser and return the result, if it is a
 * positive number. If null or undefined, returns undefined. If some other type,
 * throws.
 */
async function queryForExpression(
    driver: webdriver.WebDriver,
    expression: string): Promise<number|undefined> {
  const result =
      await driver.executeScript(`return (${expression});`) as unknown;
  if (result !== undefined && result !== null) {
    if (typeof result !== 'number') {
      throw new Error(
          `'${expression}' was type ` +
          `${typeof result}, expected number.`);
    }
    if (result < 0) {
      throw new Error(`'${expression}' was negative: ${result}`);
    }
    return result;
  }
}

/**
 * Escape a string such that it can be safely embedded in a JavaScript template
 * literal (backtick string).
 */
function escapeStringLiteral(unescaped: string): string {
  return unescaped.replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');
}
