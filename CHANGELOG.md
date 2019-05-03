# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this
project adheres to [Semantic Versioning](http://semver.org/).

## Unreleased

-   Full URLs are now supported (e.g. `tach http://example.com`). Only
    first-contentful-paint measurement is supported in this case.

-   Benchmarks are now specified as bare arguments (e.g. `tach foo`) instead of
    with the `--name` flag.

-   Fix race condition where benchmarks that returned results quickly might not
    be registered.

<!-- Add new, unreleased changes here. -->

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
