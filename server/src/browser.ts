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

require('chromedriver');
require('geckodriver');

import * as webdriver from 'selenium-webdriver';
import * as chrome from 'selenium-webdriver/chrome';

export interface MakeDriverOpts {
  /** Turn on profiling that allows us to measure paint time. */
  paint: boolean;
}

/**
 * Configure a WebDriver suitable for benchmarking the given browser.
 */
export async function makeDriver(
    browser: string, makeOpts: MakeDriverOpts): Promise<webdriver.WebDriver> {
  return await new webdriver.Builder()
      .forBrowser(browser)
      .setChromeOptions(chromeOpts(makeOpts))
      // TODO Options for other browers.
      .build();
}

function chromeOpts(makeOpts: MakeDriverOpts): chrome.Options {
  const opts = new chrome.Options();
  // TODO Test and add Chrome options that reduce variation.
  if (makeOpts.paint === true) {
    const logging = new webdriver.logging.Preferences();
    logging.setLevel(
        webdriver.logging.Type.PERFORMANCE, webdriver.logging.Level.ALL);
    opts.setLoggingPrefs(logging);
    opts.setPerfLoggingPrefs({
      traceCategories: ['devtools.timeline'].join(','),
    } as unknown as chrome.IPerfLoggingPrefs);  // TODO Upstream type fixes.
  }
  return opts;
}

/**
 * Open a new tab and switch to it. Assumes that the driver is on a page that
 * hasn't replaced `window.open` (e.g. the initial blank tab that we always
 * switch back to after running a benchmark).
 */
export async function openAndSwitchToNewTab(driver: webdriver.WebDriver):
    Promise<void> {
  await driver.executeScript('window.open();');
  const tabs = await driver.getAllWindowHandles();
  const newTab = tabs[tabs.length - 1];
  await driver.switchTo().window(newTab);
}

/**
 * Analyze the Chrome performance log to find the millisecond interval between
 * the start of the benchmark and the first paint event that followed the end of
 * the benchmark.
 */
export async function getPaintTime(driver: webdriver.WebDriver):
    Promise<number|undefined> {
  let benchStartCalled;
  // TODO Do we need a loop to ensure we get all the logs?
  const perfLogs =
      await driver.manage().logs().get(webdriver.logging.Type.PERFORMANCE);
  for (const entry of perfLogs) {
    const {method, params} = JSON.parse(entry.message).message;
    if (method === 'Tracing.dataCollected') {
      if (params.name === 'TimeStamp') {
        if (params.args.data.message === 'benchStartCalled') {
          benchStartCalled = params.ts / 1000;
        }
      } else if (params.name === 'Paint' && benchStartCalled !== undefined) {
        return ((params.ts + params.dur) / 1000) - benchStartCalled;
      }
    }
  }
}
