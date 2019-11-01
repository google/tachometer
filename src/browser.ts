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

// It's not ideal that these WebDriver plugin packages are dependencies of the
// tachometer package, since on install they download binaries for each plugin.
// IE in particular is rarely used, so is particularly wasteful. An alternative
// might be to not depend on any of these packages, and instead prompt the user
// to install them only the first time they try to drive a browser that we
// detect there is no plugin for.
//
// Also note that the edgedriver package doesn't work on recent versions of
// Windows 10, so users must manually install following Microsoft's
// documentation.
require('chromedriver');
require('geckodriver');
require('iedriver');

import * as webdriver from 'selenium-webdriver';
import * as chrome from 'selenium-webdriver/chrome';
import * as firefox from 'selenium-webdriver/firefox';
import * as edge from 'selenium-webdriver/edge';
import {isHttpUrl} from './util';

/** Tachometer browser names. Often but not always equal to WebDriver's. */
export type BrowserName = 'chrome'|'firefox'|'safari'|'edge'|'ie';

/** Browsers we can drive. */
export const supportedBrowsers =
    new Set<BrowserName>(['chrome', 'firefox', 'safari', 'edge', 'ie']);

/** Cases where Tachometer's browser name scheme does not equal WebDriver's. */
const webdriverBrowserNames = new Map<BrowserName, string>([
  ['edge', 'MicrosoftEdge'],
  ['ie', 'internet explorer'],
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
  /** A remote WebDriver server to launch the browser from. */
  remoteUrl?: string;
  /** Launch the browser window with these dimensions. */
  windowSize: WindowSize;
  /** Path to custom browser binary. */
  binary?: string;
  /** Additional binary arguments. */
  addArguments?: string[];
  /** WebDriver default binary arguments to omit. */
  removeArguments?: string[];
}

export interface WindowSize {
  width: number;
  height: number;
}

/**
 * Create a deterministic unique string key for the given BrowserConfig.
 */
export function browserSignature(config: BrowserConfig): string {
  return JSON.stringify([
    config.name,
    config.headless,
    config.remoteUrl || '',
    config.windowSize.width,
    config.windowSize.height,
  ]);
}

type BrowserConfigWithoutWindowSize =
    Pick<BrowserConfig, Exclude<keyof BrowserConfig, 'windowSize'>>;

/**
 * Parse and validate a browser string specification. Examples:
 *
 *   chrome
 *   chrome-headless
 *   chrome@<remote-selenium-server>
 */
export function parseBrowserConfigString(str: string):
    BrowserConfigWithoutWindowSize {
  let remoteUrl;
  const at = str.indexOf('@');
  if (at !== -1) {
    remoteUrl = str.substring(at + 1);
    str = str.substring(0, at);
  }
  const headless = str.endsWith('-headless');
  if (headless === true) {
    str = str.replace(/-headless$/, '');
  }
  const name = str as BrowserName;
  const config: BrowserConfigWithoutWindowSize = {name, headless};
  if (remoteUrl !== undefined) {
    config.remoteUrl = remoteUrl;
  }
  return config;
}

/**
 * Throw if any property of the given BrowserConfig is invalid.
 */
export function validateBrowserConfig(
    {name, headless, remoteUrl, windowSize}: BrowserConfig) {
  if (!supportedBrowsers.has(name)) {
    throw new Error(
        `Browser ${name} is not supported, ` +
        `only ${[...supportedBrowsers].join(', ')} are currently supported.`);
  }
  if (headless === true && !headlessBrowsers.has(name)) {
    throw new Error(`Browser ${name} does not support headless mode.`);
  }
  if (remoteUrl !== undefined && !isHttpUrl(remoteUrl)) {
    throw new Error(`Invalid browser remote URL "${remoteUrl}".`);
  }
  if (windowSize.width < 0 || windowSize.height < 0) {
    throw new Error(`Invalid window size, width and height must be >= 0.`);
  }
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
  if (config.remoteUrl !== undefined) {
    builder.usingServer(config.remoteUrl);
  } else if (config.name === 'edge') {
    // There appears to be bug where WebDriver doesn't automatically start or
    // find an Edge service and throws "Cannot read property 'start' of null"
    // so we need to start the service ourselves.
    // See https://stackoverflow.com/questions/48577924.
    // tslint:disable-next-line:no-any TODO setEdgeService function is missing.
    (builder as any).setEdgeService(new edge.ServiceBuilder());
  }
  const driver = await builder.build();
  if (config.name === 'safari' || config.name === 'edge' ||
      config.name === 'ie') {
    // Safari, Edge, and IE don't have flags we can use to launch with a given
    // window size, but webdriver can resize the window after we've started up.
    await driver.manage().window().setRect(config.windowSize);
  }
  return driver;
}

function chromeOpts(config: BrowserConfig): chrome.Options {
  const opts = new chrome.Options();
  if (config.binary) {
    opts.setChromeBinaryPath(config.binary);
  }
  if (config.headless === true) {
    opts.addArguments('--headless');
  }
  if (config.addArguments) {
    opts.addArguments(...config.addArguments);
  }
  if (config.removeArguments) {
    opts.excludeSwitches(...config.removeArguments);
  }
  const {width, height} = config.windowSize;
  opts.addArguments(`--window-size=${width},${height}`);
  return opts;
}

function firefoxOpts(config: BrowserConfig): firefox.Options {
  const opts = new firefox.Options();
  if (config.binary) {
    opts.setBinary(config.binary);
  }
  if (config.headless === true) {
    // tslint:disable-next-line:no-any TODO Incorrect types.
    (opts as any).addArguments('-headless');
  }
  const {width, height} = config.windowSize;
  // tslint:disable-next-line:no-any TODO Incorrect types.
  (opts as any).addArguments(`-width=${width}`);
  // tslint:disable-next-line:no-any TODO Incorrect types.
  (opts as any).addArguments(`-height=${height}`);
  return opts;
}

/**
 * Open a new tab and switch to it. Assumes that the driver is on a page that
 * hasn't replaced `window.open` (e.g. the initial blank tab that we always
 * switch back to after running a benchmark).
 */
export async function openAndSwitchToNewTab(
    driver: webdriver.WebDriver, config: BrowserConfig): Promise<void> {
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
  if (config.name === 'ie') {
    // For IE we get a new window instead of a new tab, so we need to resize
    // every time.
    await driver.manage().window().setRect(config.windowSize);
  }
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
 * Poll for the `window.tachometerResult` global and return it once it is set.
 * Polls every 50 milliseconds, and returns undefined if no result was found
 * after 10 seconds. Throws if a value was found, but it was not a number, or it
 * was a negative number.
 */
export async function pollForGlobalResult(
  driver: webdriver.WebDriver,
  expression: string):
    Promise<number|undefined> {
  // Both here and for FCP above, we could automatically tune the poll time
  // after we get our first result, so that when the script is fast we spend
  // less time waiting, and so that when the script is slow we interfere it
  // less frequently.
  for (let waited = 0; waited <= 10000; waited += 50) {
    await wait(50);
    const result = await driver.executeScript(`return (${expression});`) as unknown;
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
