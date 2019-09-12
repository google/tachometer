# tachometer [![Build Status](https://travis-ci.com/Polymer/tachometer.svg?branch=master)](https://travis-ci.com/PolymerLabs/tachometer) [![NPM  package](https://img.shields.io/npm/v/tachometer.svg)](https://npmjs.org/package/tachometer)

> tachometer is a tool for running benchmarks in web browsers. It uses repeated
> sampling and statistics to reliably identify even the smallest differences in
> timing.

## Why?

Benchmarking is *hard*. Even if you run the exact same JavaScript, on the same
browser, on the same machine, on the same day, you will likely get a
significantly different result every time you measure. For this reason, at first
pass, it is often very difficult to say anything meaningful about the
performance of a script.

But there is signal in the noise. Scripts do have true underlying performance
characteristics on average. By taking enough *repeated samples* and applying the
right statistics, we can reliably identify small differences and quantify our
confidence in them.

## Quick Start

1. Install tachometer from NPM.

  ```sh
  $ npm i tachometer
  ```

2. Create a simple `forloop.html` micro benchmark that times a `for` loop.
   tachometer benchmarks are HTML files that import and call `bench.start()` and
   `bench.stop()`. Note that when you are measuring [first contentful
   paint](#first-contentful-paint-fcp), you don't need to call these functions.

  ```html
  <html>
  <body>
  <script type="module">
    import * as bench from '/bench.js';
    bench.start();
    for (let i = 0; i < 1000; i++) { }
    bench.stop();
  </script>
  </body>
  </html>
  ```

3. Launch tachometer, which will launch Chrome and execute the benchmark 50
   times.

  ```sh
  $ tach forloop.html
  ```

  Along with some other information, tachometer will show you a range of
  plausible values for how long this benchmark takes to run (more precisely, a
  *95% confidence interval*, which is explained [below]()).

  <img src="./images/screen1.png">

## Features

- Measure your own [specific timings](#callback) with the `/bench.js` module, by
  setting the [window.tachometerResult](#global-result) global, or measure
  [First Contentful Paint](#first-contentful-paint-fcp) on any local or remote
  URL.


- [*Compare benchmarks*](#multiple-benchmarks) by round-robin between two or
  more files, URLs, URL query string parameters, or browsers, to measure which
  is faster or slower, and by how much, with statistical significance.


- [*Swap dependency versions*](#swap-npm-dependency-versions) of any NPM package
  you depend on, to compare published versions, remote GitHub branches, or local
  git repos.


- [*Automatically sample*](#auto-sampling) until we have enough precision to
  answer the question you are asking.


- [*Remote control*](#remote-control) browsers running on different machines
  using remote WebDriver.

## Measurement modes

Tachometer currently supports two kinds of time interval measurements,
controlled with the `--measure` flag.

#### Callback

By default with local (non-URL) benchmarks, or when the `--measure` flag is set
to **`callback`**, your page is responsible for calling the `start()` and
`stop()` functions from the `/bench.js` module. This mode is appropriate for
micro benchmarks, or any other kind of situation where you want full control
over the beginning and end times.

#### Global result

When the `--measure` flag is set to `global`, then you can assign an arbitrary
millisecond result to the `window.tachometerResult` global. In this mode,
tachometer will poll until it finds a result assigned here.

```javascript
const start = performance.now();
for (const i = 0; i < 1000; i++) { }
window.tachometerResult = performance.now() - start;
```

This mode is appropriate when you need full control of the measured time, or
when you can't use callback mode because you are not using tachometer's built-in
server.

#### First Contentful Paint (FCP)

When the `--measure` flag is set to **`fcp`**, or when the benchmark is an
external URL, then the [First Contentful Paint
(FCP)](https://developers.google.com/web/tools/lighthouse/audits/first-contentful-paint)
time will be automatically extracted from your page using the [Performance
Timeline
API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_Timeline).
This interval begins at initial navigation, and ends when the browser first
renders any DOM content. Currently, only Chrome supports the
[`first-contentful-paint`](https://www.w3.org/TR/paint-timing/#first-contentful-paint)
performance timeline entry. In this mode, calling the `start()` and `stop()`
functions is not required, and has no effect.

## Average runtime

When you execute just one benchmark, you'll get a single result: the ***average
runtime*** of the benchmark, presented as a *95% confidence interval* (see
[below](#confidence-intervals) for interpretation) for the number of
milliseconds that elapsed between `bench.start()` and `bench.stop()`.

<img src="./images/screen1.png"></img>

## Difference table

When you run multiple benchmarks together in the same session, you'll get an NxN
table summarizing all of the *differences* in runtimes, both in *absolute* and
*relative* terms (percent-change).

In this example screenshot we're comparing `for` loops, each running with a
different number of iterations (1, 1000, 1001, and 3000):

<img src="./images/screen2.png"></img>

This table tells us:

- 1 iteration was between 65% and 73% *faster* than 1000 iterations.


- 1000 iterations was between 179% and 263% *slower* than 1 iteration. Note that
  the difference between *1-vs-1000* and *1000-vs-1* is the choice of which
  runtime is used as the *reference* in the percent-change calculation, where
  the reference runtime comes from the *column* labeled *"vs X"*.


- The difference between 1000 and 1001 iterations was ambiguous. We can't tell
  which is faster, because the difference was too small. 1000 iterations could
  be as much as 13% faster, or as much as 21% slower, than 1001 iterations.

## Swap NPM dependencies

Tachometer has specialized support for swapping in custom versions of any NPM
dependency in your `package.json`. This can be used to compare the same
benchmark against one or more versions of a library it depends on.

Use the `--package-version` flag to specify a version to swap in, with format
`[label=]package@version`.

```
tach mybench.html \
  --package-version=mylib@1.0.0 \
  --package-version=master=mylib@github:MyOrg/mylib#master
```

When you use the `--package-version` flag, the following happens:

1. The `package.json` file closest to your benchmark HTML file is found.

2. A copy of this `package.json`, with the new dependency version swapped in, is
   written to the system's temp directory (use `--npm-install-dir` to change
   this location), and `npm install` is run in that directory.

3. A separate server is started for each custom NPM installation, where any
   request for the benchmark's `node_modules/` directory is served from that
   location.

> **NOTE**: Tachometer will *re-use NPM install directories* as long as the
> dependencies you specified haven't changed, and the version of tachometer used
> to install it is the same. To *always* do a fresh `npm install`, set the
> `--force-clean-npm-install` flag.

## Confidence intervals

The most important concept needed to interpret results from tachometer is the
***confidence interval***. Loosely speaking, a confidence interval is a range of
*plausible values* for a parameter (e.g. runtime), and the *confidence level*
(which we fix at *95%*) corresponds to the degree of confidence we have that
interval contains the *true value* of that parameter.

> More precisely, the 95% confidence level describes the *long-run proportion of
> confidence intervals that will contain the true value*. Hypothetically, if you
> run tachometer over and over again in the same configuration, then while you'll
> get a slightly different confidence interval every time, it should be the case
> that *95% of those confidence intervals will contain the true value*. See
> [Wikipedia](https://en.wikipedia.org/wiki/Confidence_interval#Meaning_and_interpretation)
> for more information on interpreting confidence intervals.

The *width* of a confidence interval determines the range of values it includes.
Narrower confidence intervals give you a more precise estimate of what the true
value might be. In general, we want narrower confidence intervals.

```
    <------------->   Wider confidence interval
                      High variance and/or low sample size

         <--->   Narrower confidence interval
                 Low variance and/or high sample size

 |---------|---------|---------|---------|
-1%      -0.5%       0%      +0.5%      +1%
```

Three knobs can shrink our confidence intervals:

1. Dropping the chosen confidence level. *This is not a good idea!* We want our
   results to be *consistently reported with high confidence*, so we always use
   95% confidence intervals.


2. Decreasing the variation in the benchmark timing measurements. *This is hard
   to do*. A great many factors lead to variation in timing measurements, most
   of which are very difficult to control, including some that are
   [intentionally built
   in](https://developers.google.com/web/updates/2018/02/meltdown-spectre#high-resolution_timers)!


3. Increasing the sample size. The [central limit
   theorem](https://en.wikipedia.org/wiki/Central_limit_theorem) means that,
   even when we have high variance data, and even when that data is not normally
   distributed, as we take more and more samples, we'll be able to calculate a
   more and more precise estimate of the true mean of the data. *Increasing the
   sample size is the main knob we have.*

## Sample size

By default, a minimum of 50 samples are taken from each benchmark. The
preliminary results from these samples may or may not be precise enough to allow
you to to draw a statistically significant conclusion.

> For example, if you are interested in knowing which of A and B are faster, but
> you find that the confidence interval for the percent change between the mean
> runtimes of A and B *includes zero* (e.g. `[-3.08%, +2.97%]`), then it is
> clearly not possible to draw a conclusion about whether A is faster than B or
> vice-versa.

## Auto sampling

After the initial 50 samples, tachometer will continue drawing samples until
either certain stopping conditions that you specify are met, or until a timeout
expires (3 minutes by default).

The stopping conditions for auto-sampling are specified in terms of
***horizons***. A horizon can be thought of as a *point of interest* on the
number-line of either absolute or relative differences in runtime. By setting a
horizon, you are asking tachometer to try to *shrink the confidence interval
until it is unambiguously placed on one side or the other of that horizon*.

Example horizon    | Question
------------------ | -----------
`0%`               | Is X faster or slower than Y *at all*?
`10%`              | Is X faster or slower than Y by at least 10%?
`+10%`             | Is X slower than Y by at least 10%?
`-10%`             | Is X faster than Y by at least 10%?
`-10%,+10%`        | (Same as `10%`)
`0%,10%,100%`      | Is X at all, a little, or a lot slower or faster than Y?
`0.5ms`            | Is X faster or slower than Y by at least 0.5 milliseconds?

In the following visual example, we have set `--horizon=10%` meaning that we are
interested in knowing whether A differs from B by at least 10% in either
direction. The sample size automatically increases until the confidence interval
is narrow enough to place the estimated difference squarely on one side or the
other of both horizons.

```
      <------------------------------->     n=50  ❌ -10% ❌ +10%
                <------------------>        n=100 ✔️ -10% ❌ +10%
                    <----->                 n=200 ✔️ -10% ✔️ +10%

  |---------|---------|---------|---------| difference in runtime
-20%      -10%        0       +10%      +20%

n     = sample size
<---> = confidence interval for percent difference of mean runtimes
✔️    = resolved horizon
❌    = unresolved horizon
```

In the example, by `n=50` we are not sure whether A is faster or slower than B
by more than 10%. By `n=100` we have ruled out that B is *faster* than A by more
than 10%, but we're still not sure if it's *slower* by more than 10%. By `n=200`
we have also ruled out that B is slower than A by more than 10%, so we stop
sampling. Note that we still don't know which is *absolutely* faster, we just
know that whatever the difference is, it is neither faster nor slower than 10%
(and if we did want to know, we could add `0` to our horizons).

Note that, if the actual difference is very close to a horizon, then it is
likely that the precision stopping condition will never be met, and the timeout
will expire.

## JavaScript module imports

JavaScript module imports with *bare module specifiers* (e.g. `import {foo} from
'mylib';`) will be automatically transformed to browser-compatible *path*
imports using Node-style module resolution (e.g.`import {foo} from
'./node_modules/mylib/index.js';`).

This feature can be disabled with the `--resolve-bare-modules=false` flag, or
the `resolveBareModules: false` JSON config file property.

## Browsers

Browser | Headless | [FCP](#first-contentful-paint-fcp)
------- | -------- | ---
chrome  | yes      | yes
firefox | yes      | no
safari  | no       | no
edge    | no       | no
ie      | no       | no

### Webdriver Plugins

Tachometer comes with WebDriver plugins for Chrome, Safari, Firefox, and
Internet Explorer.

For Edge, follow the [Microsoft WebDriver
installation](https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/)
documentation.

If you encounter errors while driving IE, see the [Required
Configuration](https://github.com/SeleniumHQ/selenium/wiki/InternetExplorerDriver#required-configuration)
section of the WebDriver IE plugin documentation. In particular, setting "Enable
Protected Mode" so that it is consistently either enabled or disabled across all
security zones appears to resolve `NoSuchSessionError` errors.

### Headless

If supported by the browser, you can launch in headless mode by adding
`"headless": true` to the browser JSON config, or by appending `-headless` to
the browser name when using the CLI flag (e.g. `--browser=chrome-headless`).

### Binary path and arguments

WebDriver automatically finds the location of the browser binary, and launches
it with a default set of arguments.

To customize the binary path (Chrome and Firefox only), use the `binary`
property in the browser JSON config. For example, to launch Chrome Canary from
its standard location on macOS:

```json
{
  "name": "chrome",
  "binary": "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
}
```

To pass additional arguments to the binary (Chrome and Firefox only), use the
`addArguments` property in the browser JSON config. To remove one of the
arguments that WebDriver sets by default (Chrome only), use `removeArguments`
(see example in next section).

### Profiles

It is normally reccommended to use the default behavior whereby a new, empty
browser profile is created when the browser is launched, so that state from your
personal profile (cookies, extensions, cache etc.) do not influence benchmark
results.

However, in some cases it may be useful to use an existing browser profile, for
example if the webpage you are benchmarking requires being signed into an
account.

In Chrome, you can use the `user-data-dir` flag to launch the browser using an
existing profile directory. You may also need to remove the `use-mock-keychain`
default argument if you encounter authentication problems. You can find out the
current binary path, profile location, and arguments of a running Chrome session
by visiting the `chrome://version` URL.

NOTE: If there is an existing Chrome process using the profile, you must
first terminate it. You also need to close all open tabs, or disable the
"Continue where you left off" startup setting, because tachometer does not
expect to find any existing tabs.

For example, using the standard location of the default user profile on macOS
(note that the final `/Default` path component is *not* included):

```json
{
  "name": "chrome",
  "addArguments": [
    "user-data-dir=/Users/<username>/Library/Application Support/Google/Chrome"
  ],
  "removeArguments": [
    "use-mock-keychain"
  ]
}
```

## Remote control

Tachometer can control and benchmark browsers running on remote machines by
using the [Standalone Selenium
Server](https://seleniumhq.github.io/docs/remote.html), which supports macOS,
Windows, and Linux.

This may be useful if you want to develop on one platform but benchmark on
another, or if you want to use a dedicated benchmarking computer for better
performance isolation.

> Note you will need to know the IP address of both your local and remote
> machine for the setup steps below. You can typically use `ipconfig` on
> Windows, `ifconfig` on macOS, and `ip` on Linux to find these addresses.
> You'll need to be able to initiate connections between these machines in both
> directions, so if you encounter problems, it's possible that there is a
> firewall or NAT preventing the connection.

#### On the *remote* machine:

1. Install a [Java Development Kit
   (JDK)](https://www.oracle.com/technetwork/java/javase/downloads/index.html)
   if you don't already have one.


2. Download the latest Standalone Selenium Server `.jar` file from
   [seleniumhq.org](https://www.seleniumhq.org/download/).


3. Download the driver plugins for the browsers you intend to remote control
   from [seleniumhq.org](https://www.seleniumhq.org/download/). Note that if you
   download a plugin archive file, the archive contents must be extracted and
   placed either in the current working directory for the next command, or in a
   directory that is included in your `$PATH` environment variable.


4. Launch the Standalone Selenium Server.

   ```bash
   java -jar selenium-server-standalone-<version>.jar
   ```

#### On the *local* machine:

 1. Use the `--browser` flag or the `browser` config file property with syntax
    `<browser>@<remote-url>` to tell tachometer the IP address or hostname of
    the remote Standalone Selenium Server to launch the browser from. Note that
    `4444` is the default port, and the `/wd/hub` URL suffix is required.

    ```bash
    --browser=chrome@http://my-remote-machine:4444/wd/hub
    ```

 2. Use the `--host` flag to configure the network interface address that
    tachometer's built-in static server will listen on (unless you are only
    benchmarking external URLs that do not require the static server). By
    default, for security, tachometer listens on `127.0.0.1` and will not be
    accessible from the remote machine unless you change this to an IP address
    or hostname that will be accessible from the remote machine.


 3. If needed, use the `--remote-accessible-host` flag to configure the URL that
    the remote browser will use when making requests to your local tachometer
    static server. By default this will match `--host`, but in some network
    configurations it may need to be different (e.g. if the machines are
    separated by a NAT).

## Config file

Use the `--config` flag to control tachometer with a JSON configuration file.
Defaults are the same as the corresponding command-line flags.

```json
{
  "root": "./benchmarks",
  "sampleSize": 50,
  "timeout": 3,
  "autoSampleConditions": ["0%", "1%"],
  "benchmarks": [
    {
      "name": "foo",
      "url": "foo/bar.html?baz=123",
      "browser": {
        "name": "chrome",
        "headless": true,
        "windowSize": {
          "width": 800,
          "height": 600,
        },
      },
      "measure": "fcp",
      "packageVersions": {
        "label": "master",
        "dependencies": {
          "mylib": "github:Polymer/mylib#master",
        },
      }
    },
  ],
}
```

Use the `expand` property in a benchmark object to recursively generate multiple
variations of the same benchmark configuration. For example, to test the same
benchmark file with two different browsers, you can use `expand` instead of
duplicating the entire benchmark configuration:

```json
{
  "benchmarks": [
    {
      "url": "foo/bar.html",
      "expand": [
        {
          "browser": "chrome"
        },
        {
          "browser": "firefox"
        },
      ],
    },
  ],
}
```

Which is equivalent to:

```json
{
  "benchmarks": [
    {
      "url": "foo/bar.html",
      "browser": "chrome"
    },
    {
      "url": "foo/bar.html",
      "browser": "firefox"
    },
  ],
}
```

## Usage

Run a benchmark from a local file:
```sh
tach foo.html
```

Compare a benchmark with different URL parameters:
```sh
tach foo.html?i=1 foo.html?i=2
```

Benchmark `index.html` in a directory:
```sh
tach foo/bar
```

Benchmark First Contentful Paint time of a remote URL:
```sh
tach http://example.com
```

Flag                    -  | Default     | Description
-------------------------- | ----------- | --------------------------------
`--help`                   | `false`     | Show documentation
`--root`                   | `./`        | Root directory to search for benchmarks
`--host`                   | `127.0.0.1` | Which host to run on
`--port`                   | `8080, 8081, ..., 0`| Which port to run on (comma-delimited preference list, `0` for random)
`--config`                 | *(none)*    | Path to JSON config file ([details](#config-file))
`--package-version` / `-p` | *(none)*    | Specify an NPM package version to swap in ([details](#swap-npm-dependencies))
`--browser` / `-b`         | `chrome`    | Which browsers to launch in automatic mode, comma-delimited (chrome, firefox, safari, edge, ie) ([details](#browsers))
`--window-size`            | `1024,768`  | "width,height" in pixels of the browser windows that will be created
`--sample-size` / `-n`     | `50`        | Minimum number of times to run each benchmark ([details](#sample-size)]
`--horizon`                | `10%`       | The degrees of difference to try and resolve when auto-sampling ("N%" or "Nms", comma-delimited) ([details](#auto-sampling))
`--timeout`                | `3`         | The maximum number of minutes to spend auto-sampling ([details](#auto-sampling))
`--measure`                | `callback`  | Which time interval to measure (`callback`, `global`, `fcp`) ([details](#measurement-modes))
`--remote-accessible-host` | matches `--host` | When using a browser over a remote WebDriver connection, the URL that those browsers should use to access the local tachometer server ([details](#remote-control))
`--npm-install-dir`        | system temp dir | Where to install custom package versions. ([details](#swap-npm-dependencies))
`--force-clean-npm-install`| `false`     | Always do a from-scratch NPM install when using custom package versions. ([details](#swap-npm-dependencies))
`--csv-file`               | *none*      | Save results to this CSV file.
`--json-file`              | *none*      | Save results to this JSON file.
