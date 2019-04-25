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
import * as firefox from 'selenium-webdriver/firefox';

/**
 * Browsers we can drive.
 */
export const validBrowsers = new Set([
  'chrome',
  'chrome-headless',
  'firefox',
  'firefox-headless',
  'safari',
]);

/**
 * Browsers for which we can find the first contentful paint (FCP) time.
 */
export const fcpBrowsers = new Set([
  'chrome',
  'chrome-headless',
]);

/**
 * Configure a WebDriver suitable for benchmarking the given browser.
 */
export async function makeDriver(browser: string):
    Promise<webdriver.WebDriver> {
  const headless = browser.endsWith('-headless');
  if (headless === true) {
    browser = browser.replace(/-headless$/, '');
  }
  return await new webdriver.Builder()
      .forBrowser(browser)
      .setChromeOptions(chromeOpts(headless))
      .setFirefoxOptions(firefoxOpts(headless))
      .build();
}

function chromeOpts(headless: boolean): chrome.Options {
  const opts = new chrome.Options();
  if (headless === true) {
    opts.addArguments('--headless');
  }
  return opts;
}

function firefoxOpts(headless: boolean): firefox.Options {
  const opts = new firefox.Options();
  if (headless === true) {
    // tslint:disable-next-line:no-any TODO Incorrect types.
    (opts as any).addArguments('-headless');
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
  // Chrome and Firefox add new tabs to the end of the handle list, but Safari
  // adds them to the beginning. Just look for the new one instead of making
  // any assumptions about this order.
  const tabsBefore = await driver.getAllWindowHandles();
  if (tabsBefore.length !== 1) {
    throw new Error(`Expected only 1 open tab, got ${tabsBefore.length}`);
  }
  await driver.executeScript('window.open();');
  const tabsAfter = await driver.getAllWindowHandles();
  const newTabs = tabsAfter.filter((tab) => tab !== tabsBefore[0]);
  if (newTabs.length !== 1) {
    throw new Error(`Expected to create 1 new tab, got ${newTabs.length}`);
  }
  await driver.switchTo().window(newTabs[0]);
}

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
 * https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry
 *
 * Note a more complete interface for this is defined in the standard
 * lib.dom.d.ts, but we don't want to depend on that since it would make all DOM
 * types ambiently defined.
 */
interface PerformanceEntry {
  name: string;
  startTime: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
