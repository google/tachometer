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
import * as chrome from 'selenium-webdriver/chrome';
import * as edge from 'selenium-webdriver/edge';
import * as firefox from 'selenium-webdriver/firefox';

import {installOnDemand} from './install';
import {isHttpUrl} from './util';

/** Tachometer browser names. Often but not always equal to WebDriver's. */
export type BrowserName = 'chrome'|'firefox'|'safari'|'edge'|'ie';

/** Browsers we can drive. */
export const supportedBrowsers = new Set<BrowserName>([
  'chrome',
  'firefox',
  'safari',
  'edge',
  'ie',
]);

type WebdriverModuleName = 'chromedriver'|'geckodriver'|'iedriver';

// Note that the edgedriver package doesn't work on recent versions of
// Windows 10, so users must manually install following Microsoft's
// documentation.
const browserWebdriverModules = new Map<BrowserName, WebdriverModuleName>([
  ['chrome', 'chromedriver'],
  ['firefox', 'geckodriver'],
  ['ie', 'iedriver'],
]);

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
  /** CPU Throttling rate. (1 is no throttle, 2 is 2x slowdown, etc). */
  cpuThrottlingRate?: number;
  /** Advanced preferences usually set from the about:config page. */
  preferences?: {[name: string]: string|number|boolean};
  /** Trace browser logs configuration */
  trace?: TraceConfig;
}

/**
 * Configuration to turn on Chrome tracing
 */
interface TraceConfig {
  /**
   * The list tracing categories Chrome should log
   */
  categories: string[];

  /**
   * The directory to log Chrome traces to
   */
  logDir: string;
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
    config.remoteUrl ?? '',
    config.windowSize.width,
    config.windowSize.height,
    config.binary ?? '',
    config.addArguments ?? [],
    config.removeArguments ?? [],
    config.cpuThrottlingRate ?? 1,
    config.preferences ?? {},
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
export function validateBrowserConfig({
  name,
  headless,
  remoteUrl,
  windowSize,
}: BrowserConfig) {
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
  const browserName: BrowserName = config.name;
  const webdriverModuleName = browserWebdriverModules.get(browserName);

  if (webdriverModuleName != null) {
    await installOnDemand(webdriverModuleName);
    require(webdriverModuleName);
  }

  // TODO: ANDRE
  if (browserName === 'chrome') {
    const chromeOptions = {
      excludeSwitches: config.removeArguments ? config.removeArguments : [],
      args: [
        // "--js-flags=--expose-gc",
        // "--enable-precise-memory-info",
        '--no-first-run',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-cache',
        '--disable-translate',
        '--disable-sync',
        '--disable-extensions',
        '--disable-default-apps',
        '--no-sandbox',
        config.headless ? '--headless' : '',
        config.windowSize ? `--window-size=${config.windowSize.width},${
                                config.windowSize.height}` :
                            ''
      ].filter(Boolean)
                .concat(config.addArguments ? config.addArguments : []),
    };

    const capabilities = new webdriver.Capabilities({
      browserName: 'chrome',
      platform: 'ANY',
      version: 'stable',
      binary: config.binary,
      'goog:chromeOptions': {
        args: chromeOptions.args,
        perfLoggingPrefs: {
          enableNetwork: true,
          enablePage: true,
          traceCategories: config.trace?.categories.join(','),
        },
      },
      'goog:loggingPrefs': {
        browser: 'ALL',
        performance: 'ALL',
      },
    });
    const service = new chrome.ServiceBuilder().build();
    return chrome.Driver.createSession(capabilities, service);
  } else {
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
      // window size, but webdriver can resize the window after we've started
      // up. Some versions of Safari have a bug where it is required to also
      // provide an x/y position (see
      // https://github.com/SeleniumHQ/selenium/issues/3796).
      const rect = config.name === 'safari' ?
          {...config.windowSize, x: 0, y: 0} :
          config.windowSize;
      await driver.manage().window().setRect(rect);
    }
    return driver;
  }
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
  if (config.preferences) {
    for (const [name, value] of Object.entries(config.preferences)) {
      opts.setPreference(name, value);
    }
  }
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

  // "noopener=yes" prevents the new window from being able to access the
  // first window. We set that here because in Chrome (and perhaps other
  // browsers) we see a very significant improvement in the reliability of
  // measurements, in particular it appears to eliminate interference between
  // code across runs. It is likely this flag increases process isolation in a
  // way that prevents code caching across tabs.
  await driver.executeScript('window.open("", "", "noopener=yes");');
  // Firefox (and maybe other browsers) won't always report the new tab ID
  // immediately, so we'll need to poll for it.
  const maxRetries = 20;
  const retrySleepMs = 250;
  let retries = 0;
  let newTabId;
  while (true) {
    const tabsAfter = await driver.getAllWindowHandles();
    const newTabs = tabsAfter.filter((tab) => tab !== tabsBefore[0]);
    if (newTabs.length === 1) {
      newTabId = newTabs[0];
      break;
    }
    retries++;
    if (newTabs.length > 1 || retries > maxRetries) {
      throw new Error(`Expected to create 1 new tab, got ${newTabs.length}`);
    }
    await new Promise((resolve) => setTimeout(resolve, retrySleepMs));
  }
  await driver.switchTo().window(newTabId);

  if (config.name === 'ie' || config.name === 'safari') {
    // For IE and Safari (with rel=noopener) we get a new window instead of a
    // new tab, so we need to resize every time.
    const rect = config.name === 'safari' ? {...config.windowSize, x: 0, y: 0} :
                                            config.windowSize;
    await driver.manage().window().setRect(rect);
  }
  type WithSendDevToolsCommand = {
    sendDevToolsCommand?: (command: string, config: {}) => Promise<void>;
  };

  const driverWithSendDevToolsCommand =
      (driver as {}) as WithSendDevToolsCommand;
  if (driverWithSendDevToolsCommand.sendDevToolsCommand &&
      config.cpuThrottlingRate !== undefined) {
    // Enables CPU throttling to emulate slow CPUs.
    await driverWithSendDevToolsCommand.sendDevToolsCommand(
        'Emulation.setCPUThrottlingRate', {rate: config.cpuThrottlingRate});
  }
}
