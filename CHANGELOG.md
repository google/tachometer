# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this
project adheres to [Semantic Versioning](http://semver.org/).

## Unreleased

### Added

-   Added `--csv-file` flag which writes raw NxN results result table to a CSV
    file. ([#88](https://github.com/Polymer/tachometer/issues/88)).

-   During auto-sampling, the time remaining before the timeout will be hit is
    now displayed ([#107](https://github.com/Polymer/tachometer/issues/107)).

### Fixed

-   `--resolve-bare-modules` (with no value) no longer disables bare module
    resolution ([#99](https://github.com/Polymer/tachometer/issues/99)).

-  Fix bug where 404s results in e.g. `Unknown response type undefined for
   /favicon.ico` errors logged to the console.
   [#105](https://github.com/Polymer/tachometer/issues/105)).

## [0.4.9] 2019-07-11

-   Responses from the local server are now cached in-memory. This greatly
    improves performance when bare module resolution is enabled, because HTML
    and JS is now only parsed once per benchmark, instead of once per sample.

-   Do one throw-away warm-up run for each benchmark before starting
    measurement. This should help reduce measurement variation due to any
    cold-start effects that would have previously applied to the first sample.

-   Fix bug where timeouts in measuring the `window.tachometerResult` global
    (e.g. when the server is down) could cause a crash with `Reduce of empty
    array with no initial value`
    ([#86](https://github.com/Polymer/tachometer/issues/86)).

-   When using custom package versions, the temporary NPM install directories
    will now be re-used less aggressively across runs of tachometer. If any of
    the specified dependency versions have changed, or if the version of
    tachometer being used has changed, then a fresh NPM install will be
    performed. Additionally, the new `--force-clean-npm-install` flag can be
    used to force a clean NPM install every time.

-   Fix bug where the `node_modules` directory could sometimes be mounted at the
    URL `//node_modules`, causing benchmarks to fail to load dependencies.

-   Don't show URL query parameters in the result table when an alias was
    specified.

-   Fix bug where browser in result table was displayed as `[object Object]`
    instead of its name.

## [0.4.8] 2019-07-08

-   Fix bug where `<html>`, `<body>`, and `<head>` tags could be removed from
    HTML files served by the built-in static server (via version bump to
    `koa-node-resolve`).

-   Browsers in the JSON config file can now be specified as an object, e.g.
    `browser: { name: 'chrome', headless: true }`. The string format is still
    supported, though more options will be supported by the object form (e.g.
    `windowSize` below).

-   Added `--window-size` flag and `browser:{ windowSize: {width, height} }`
    JSON config file property to control browser window size. Browsers will be
    resized to 1024x768 by default.

## [0.4.7] 2019-06-14

-   Add support for Internet Explorer in Windows (`--browser=ie`).

## [0.4.6] 2019-06-12

-   Add support for Edge in Windows (`--browser=edge`).

-   Add support for remote WebDriver with e.g.
    `--browser=chrome@http://<remote-selenium-server>`. See `README` for more
    details.

-   Add `--measure=global` mode, where the benchmark assigns an arbitrary
    millisecond result to `window.tachometerResult`, and tachometer will poll
    until it is found.

-   Fix bug where no browser other than Chrome could be launched.

-   Fix bug where process did not exit on most exceptions.

## [0.4.5] 2019-06-10

-   Fix `$schema` property URL automatically added to config files.

## [0.4.4] 2019-06-08

-   Remove noisy debug logging for bare module import resolution.

## [0.4.3] 2019-06-08

-   Automatically update config files with a `$schema` property, pointing to the
    JSON schema for the file on unpkg. This will provide in-editor contextual
    help for many IDEs (like VS Code) when writing tachometer config files.

-   Add `tachometer` bin alias, so that `npx tachometer` can be used (previously
    the binary could only be invoked as `tach`).

## [0.4.2] 2019-06-07

-   Add `--config` flag to configure benchmarks through a JSON configuration
    file instead of flags. See `README.md` for format details.

-   JavaScript imports with bare module specifiers (e.g. `import {foo} from
    'mylib';`) will now be automatically transformed to browser-compatible path
    imports using Node-style module resolution (e.g.`import {foo} from
    './node_modules/mylib/index.js';`). This feature can be disabled with the
    `--resolve-bare-modules=false` flag or the `resolveBareModules: false` JSON
    config file property.

## [0.4.1] 2019-06-06

-   A `label` can now be set in the GitHub check JSON object.

## [0.4.0] 2019-05-08

-   Benchmarks are now specified as arbitrary paths to local HTML files or
    directories (containing an `index.html`). Benchmarks are no longer required
    to be laid out in any particular directory structure. E.g. you can now
    invoke as `tach foo.html` or `tach myalias=foo/bar/baz`. There is no longer
    a concept of *implementations*.

-   Local benchmark files can now include URL query strings (e.g. `tach
    foo.html?a=b`) which will be included as-is in the launched URL.

-   Variants no longer exist. Use URL query strings instead (see above).

-   Custom package versions are now installed to the system's temp dir, instead
    of into the project directory.

-   `--manual` mode no longer shows benchmark names and other metadata (but it
    should only be used for testing the web server anyway since it has no
    statistical significance).

-   Add `--version` flag.

## [0.3.0] 2019-05-03

-   Full URLs are now supported (e.g. `tach http://example.com`). Only
    first-contentful-paint measurement is supported in this case.

-   Benchmarks are now specified as bare arguments (e.g. `tach foo`) instead of
    with the `--name` flag.

-   Fix race condition where benchmarks that returned results quickly might not
    be registered.

## [0.2.1] 2019-04-26

-   Added support for measuring First Contentful Paint (FCP), enabled by setting
    the `--measure=fcp` flag.

## [0.2.0] 2019-04-25

-   Result differences are now reported as an NxN matrix, so that every result
    can be compared to any other result. The `--baseline` flag has been removed,
    since it is no longer necessary.

-   GitHub Check report is now formatted as HTML instead of ASCII.

-   Remove standard deviation column, as it is rarely useful to interpret
    directly.

## [0.1.0] 2019-04-17

-   Initial release.
