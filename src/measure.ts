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

import * as webdriver from 'selenium-webdriver';

/**
 * Return the First Contentful Paint (FCP) time (millisecond interval since
 * navigation) for the given driver. Polls every 100 milliseconds, and returns
 * undefined if no FCP was found after 10 seconds.
 *
 * https://w3c.github.io/paint-timing/#first-contentful-paint
 * https://developers.google.com/web/tools/lighthouse/audits/first-contentful-paint
 */
export async function pollForFirstContentfulPaint(driver: webdriver.WebDriver):
    Promise<number|undefined> {
  for (let waited = 0; waited <= 10000; waited += 100) {
    await wait(100);
    const entries = await driver.executeScript(
                        'return window.performance.getEntriesByName(' +
                        '"first-contentful-paint");') as PerformanceEntry[];
    if (entries.length > 0) {
      return entries[0].startTime;
    }
  }
}

/**
 * Poll for the `window.tachometerResult` global and return it once it is set.
 * Polls every 50 milliseconds, and returns undefined if no result was found
 * after 10 seconds. Throws if a value was found, but it was not a number, or it
 * was a negative number.
 */
export async function pollForGlobalResult(
    driver: webdriver.WebDriver,
    expression: string): Promise<number|undefined> {
  // Both here and for FCP above, we could automatically tune the poll time
  // after we get our first result, so that when the script is fast we spend
  // less time waiting, and so that when the script is slow we interfere it
  // less frequently.
  for (let waited = 0; waited <= 10000; waited += 50) {
    await wait(50);
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
}

/**
 * https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry
 *
 * Note a more complete interface for this is defined in the standard
 * lib.dom.d.ts, but we don't want to depend on that since it would make all
 * DOM types ambiently defined.
 */
interface PerformanceEntry {
  name: string;
  startTime: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
