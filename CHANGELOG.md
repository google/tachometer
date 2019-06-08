# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this
project adheres to [Semantic Versioning](http://semver.org/).

<!-- ## Unreleased -->
<!-- Add new, unreleased changes here. -->

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
