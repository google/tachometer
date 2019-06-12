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
import * as edge from 'selenium-webdriver/edge';

/** Tachometer browser names. Often but not always equal to WebDriver's. */
export type BrowserName = 'chrome'|'firefox'|'safari'|'edge';

/** Browsers we can drive. */
export const supportedBrowsers =
    new Set<BrowserName>(['chrome', 'firefox', 'safari', 'edge']);

/** Cases where Tachometer's browser name scheme does not equal WebDriver's. */
const webdriverBrowserNames = new Map<BrowserName, string>([
  ['edge', 'MicrosoftEdge'],
]);

/** Browsers that support headless mode. */
const headlessBrowsers = new Set<BrowserName>(['chrome', 'firefox']);

/** Browsers for which we can find the first contentful paint (FCP) time. */
export const fcpBrowsers = new Set<BrowserName>(['chrome']);

export interface BrowserConfig {
  /** Name of the browser. */
  name: BrowserName;
  /** Whether to run in headless mode. */
  headless: boolean;
}

/**
 * Parse and validate a browser string specification. Examples:
 *
 *   chrome
 *   chrome-headless
 */
export function parseAndValidateBrowser(str: string): BrowserConfig {
  const headless = str.endsWith('-headless');
  if (headless === true) {
    str = str.replace(/-headless$/, '');
  }
  const name = str as BrowserName;
  if (!supportedBrowsers.has(name)) {
    throw new Error(
        `Browser ${name} is not supported, ` +
        `only ${[...supportedBrowsers].join(', ')} are currently supported.`);
  }
  if (headless === true && !headlessBrowsers.has(name)) {
    throw new Error(`Browser ${name} does not support headless mode.`);
  }
  return {name, headless};
}

/**
 * Configure a WebDriver suitable for benchmarking the given browser.
 */
export async function makeDriver(config: BrowserConfig):
    Promise<webdriver.WebDriver> {
  const builder = new webdriver.Builder();
  const webdriverName = webdriverBrowserNames.get(config.name) || config.name;
  builder.forBrowser(webdriverName);
  builder.setChromeOptions(chromeOpts(config));
  builder.setFirefoxOptions(firefoxOpts(config));
  if (config.name === 'edge') {
    // There appears to be bug where WebDriver doesn't automatically start or
    // find an Edge service and throws "Cannot read property 'start' of null"
    // so we need to start the service ourselves.
    // See https://stackoverflow.com/questions/48577924.
    // tslint:disable-next-line:no-any TODO setEdgeService function is missing.
    (builder as any).setEdgeService(new edge.ServiceBuilder());
  }
  return await builder.build();
}

function chromeOpts(config: BrowserConfig): chrome.Options {
  const opts = new chrome.Options();
  if (config.headless === true) {
    opts.addArguments('--headless');
  }
  return opts;
}

function firefoxOpts(config: BrowserConfig): firefox.Options {
  const opts = new firefox.Options();
  if (config.headless === true) {
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
 * lib.dom.d.ts, but we don't want to depend on that since it would make all
 * DOM types ambiently defined.
 */
interface PerformanceEntry {
  name: string;
  startTime: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
