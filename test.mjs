import path from "path";
import fs from "fs/promises";
import selenium from "selenium-webdriver";
import logging from "selenium-webdriver/lib/logging.js";
import chrome from "selenium-webdriver/chrome.js";

const { Builder, WebDriver, Condition, By, Capabilities } = selenium;

/**
 *
 * @param {Partial<import('./src/browser').BrowserConfig>} [config]
 * @returns {chrome.Options}
 */
function chromeOpts(config = {}) {
  const opts = new chrome.Options();
  if (config.binary) {
    opts.setChromeBinaryPath(config.binary);
  }
  if (config.headless === true) {
    opts.headless();
    // opts.addArguments("--headless");
  }
  if (config.addArguments) {
    opts.addArguments(...config.addArguments);
  }
  if (config.removeArguments) {
    opts.excludeSwitches(...config.removeArguments);
  }
  if (config.windowSize) {
    const { width, height } = config.windowSize;
    opts.addArguments(`--window-size=${width},${height}`);
  }

  let args = [
    "--js-flags=--expose-gc",
    "--enable-precise-memory-info",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-cache",
    "--disable-translate",
    "--disable-sync",
    "--disable-extensions",
    "--disable-default-apps",
    "--no-sandbox",
  ];

  opts.addArguments(...args);

  // https://www.selenium.dev/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_Capabilities.html
  const loggingPref = new logging.Preferences();
  loggingPref.setLevel(logging.Type.BROWSER, logging.Level.ALL);
  loggingPref.setLevel(logging.Type.PERFORMANCE, logging.Level.ALL);
  opts.setLoggingPrefs(loggingPref);

  // https://www.selenium.dev/selenium/docs/api/javascript/module/selenium-webdriver/chrome_exports_Options.html
  // @ts-ignore
  opts.setPerfLoggingPrefs({
    enableNetwork: true,
    enablePage: true,
    // tracingCategories: "devtools.timeline,blink.user_timing",
    tracingCategories: [
      "blink",
      "blink.user_timing",
      "v8",
      "v8.execute",
      "disabled-by-default-v8.compile",
      "disabled-by-default-v8.cpu_profiler",
      "disabled-by-default-v8.gc",
      // "disabled-by-default-v8.gc_stats",
      // "disabled-by-default-v8.ic_stats", // ? Not sure what this outputs...
      // "disabled-by-default-v8.runtime_stats", // outputs
      "disabled-by-default-v8.turbofan",
    ].join(","),
  });

  return opts;
}

function getCaps() {
  let args = [
    "--js-flags=--expose-gc",
    "--enable-precise-memory-info",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-cache",
    "--disable-translate",
    "--disable-sync",
    "--disable-extensions",
    "--disable-default-apps",
    "--no-sandbox",
  ];

  return new Capabilities({
    browserName: "chrome",
    platform: "ANY",
    version: "stable",
    "goog:chromeOptions": {
      // binary: benchmarkOptions.chromeBinaryPath,
      args: args,
      perfLoggingPrefs: {
        enableNetwork: true,
        enablePage: true,
        traceCategories: [
          "blink",
          "blink.user_timing",
          "v8",
          "v8.execute",
          "disabled-by-default-v8.compile",
          "disabled-by-default-v8.cpu_profiler",
          "disabled-by-default-v8.gc",
          // "disabled-by-default-v8.gc_stats",
          // "disabled-by-default-v8.ic_stats", // ? Not sure what this outputs...
          // "disabled-by-default-v8.runtime_stats", // outputs
          "disabled-by-default-v8.turbofan",
        ].join(","),
      },
      excludeSwitches: ["enable-automation"],
    },
    "goog:loggingPrefs": {
      browser: "ALL",
      performance: "ALL",
    },
  });
}

/**
 * @typedef {chrome.Driver} Driver
 * @returns {Promise<Driver>}
 */
async function buildDriver() {
  let service = new chrome.ServiceBuilder().build();
  let driver = chrome.Driver.createSession(getCaps(), service);

  return driver;

  // return new Builder()
  //   .forBrowser("chrome")
  //   .setChromeOptions(
  //     chromeOpts({
  //       // binary:
  //       //   "C:\\Program Files (x86)\\Google\\Chrome Dev\\Application\\chrome.exe",
  //     })
  //   )
  //   .build();
}

/** @type {Driver} */
let driver;
async function main() {
  driver = await buildDriver();

  await driver.get("http://127.0.0.1:8080/src/02_replace1k.html");
  await delay(7000);
  await testTextContains(
    driver,
    "tbody > tr:first-child > td:first-child",
    "5001"
  );

  /**
   * @typedef {import('selenium-webdriver').logging.Entry} Entry
   * @type {Entry[]}
   */
  let newPerfEntries;
  /** @type {Entry[]} */
  // let browserEntries = [];
  /** @type {Entry[]} */
  let perfEntries = [];

  do {
    newPerfEntries = await driver.manage().logs().get(logging.Type.PERFORMANCE);

    perfEntries = perfEntries.concat(newPerfEntries);
    // browserEntries = browserEntries.concat(
    //   await driver.manage().logs().get(logging.Type.BROWSER)
    // );
  } while (newPerfEntries.length > 0);

  // console.log(perfEntries.length);
  // await fs.writeFile(
  //   "selenium-perf-logs.json",
  //   formatLogs(perfEntries),
  //   "utf8"
  // );

  console.log(perfEntries.length);
  await fs.writeFile(
    "selenium-trace-logs.json",
    formatTraceLogs(perfEntries),
    "utf8"
  );

  // console.log(browserEntries.length);
  // await fs.writeFile(
  //   "selenium-browser-logs.json",
  //   formatLogs(browserEntries),
  //   "utf8"
  // );

  // DevTools protocol: https://chromedevtools.github.io/devtools-protocol/tot/Profiler/
  // Could look at sendDevToolsCommand: https://www.selenium.dev/selenium/docs/api/javascript/module/selenium-webdriver/chrome_exports_Driver.html
  // VSCode JS Debugger uses Chrome DevTools Protocol: https://github.com/microsoft/vscode-js-debug/blob/60c4b009fc1f226bb502d260347a514e2578bc15/src/adapter/profiling/basicCpuProfiler.ts#L59

  // ChromeDriver perf log docs: https://chromedriver.chromium.org/logging/performance-log
  // Trace events doc: http://www.chromium.org/developers/how-tos/trace-event-profiling-tool
  // Trace events format spec: https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/edit#

  // Trace events methods for some events map to Chrome DevTool protocol methods: https://chromedevtools.github.io/devtools-protocol/tot

  // Setting up Driver
  // js-framework-benchmark: https://github.com/krausest/js-framework-benchmark/blob/77e120f97eaf2c69321b836016b25d1f2bba60c9/webdriver-ts/src/webdriverAccess.ts#L217
  // Tachometer: https://github.com/Polymer/tachometer/blob/a1c6457048f7511b57995ba0f5cc6ed719195adf/src/browser.ts#L157

  // Reading perf logs:
  // js-framework-benchmark: https://github.com/krausest/js-framework-benchmark/blob/77e120f97eaf2c69321b836016b25d1f2bba60c9/webdriver-ts/src/forkedBenchmarkRunner.ts#L74
  // @angular/benchpress: https://github.com/angular/angular/blob/a84976fdfcde45adeba406be48ed979c2010ee57/packages/benchpress/src/webdriver/chrome_driver_extension.ts#L81

  // Visualizing profiles:
  // vs-code-js-profile-flame: https://github.com/microsoft/vscode-js-profile-visualizer/tree/master/packages/vscode-js-profile-flame

  // Visualizing v8 tick logs:
  // Intro to v8 sampling profiler: https://v8.dev/docs/profile
  // flamegrill (Uses puppeteer to generate v8.log with ticks): https://github.com/microsoft/flamegrill/blob/e318f4134e567327fe29d342eacd3a37a64d4a92/packages/flamegrill/src/profile/profile.ts#L51
  // V8 Tick processor: https://github.com/v8/v8/blob/d2ab873de9b119ebf97aa791c015c9817992265a/tools/tickprocessor.mjs#L92
  // ^^ converts .log into custom JSON data structure and can print stats about profile
  //
  // flamebearer (view flamegraph of V8 tick processor output): https://www.npmjs.com/package/flamebearer
}

main().finally(async () => {
  if (driver) {
    await driver.close();
    await driver.quit();
  }
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {import('selenium-webdriver').logging.Entry[]} logs
 * @returns {string}
 */
function formatLogs(logs) {
  let out = "[\n";
  for (let i = 0; i < logs.length; i++) {
    let log = logs[i];

    out += log.message.startsWith("{")
      ? log.message
      : JSON.stringify(log.message);

    if (i < logs.length - 1) {
      out += ",\n";
    }
  }

  out += "\n]";
  return out;
}

/**
 * @param {import('selenium-webdriver').logging.Entry[]} entries
 * @returns {string}
 */
function formatTraceLogs(entries) {
  let out = "[\n";
  for (let i = 0; i < entries.length; i++) {
    let entry = entries[i];

    let log = JSON.parse(entry.message).message;
    if (log.method !== "Tracing.dataCollected") {
      continue;
    }

    let data = log.params;
    if (data.name == "ProfileChunk") {
      continue;
    }

    out += JSON.stringify(data);

    if (i < entries.length - 1) {
      out += ",\n";
    }
  }

  out += "\n]";
  return out;
}

/**
 * @param {Driver} driver
 */
function waitForCondition(driver) {
  /**
   * @param {string} text
   * @param {(dirver: Driver) => Promise<boolean>} fn
   * @param {number} timeout
   */
  async function waiter(text, fn, timeout) {
    return await driver.wait(new Condition(text, fn), timeout);
  }

  return waiter;
}

/**
 * @param {Driver} driver
 * @param {string} selector
 * @param {string} text
 * @param {number} [timeout]
 */
export async function testTextContains(
  driver,
  selector,
  text,
  timeout = 60 * 1000
) {
  return waitForCondition(driver)(
    `testTextContains ${selector} ${text}`,
    async function (driver) {
      try {
        let elem = await driver.findElement(By.css(selector));
        if (elem == null) return false;
        let v = await elem.getText();
        return v && v.indexOf(text) > -1;
      } catch (err) {
        console.log(
          "ignoring error in testTextContains for selector = " +
            selector +
            " text = " +
            text,
          err.toString().split("\n")[0]
        );
      }
    },
    timeout
  );
}
