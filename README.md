# Lit Benchmarks

Benchmarks for evaluating the performance of
[lit-html](https://github.com/Polymer/lit-html), along with alternative
implementations.

## Contents

- [Setup](#setup)
- [Flags](#flags)
- [Automatic mode](#automatic-mode)
- [Sample size](#sample-size)
- [Manual mode](#manual-mode)
- [Saving data](#saving-data)
- [Adding benchmarks](#adding-benchmarks)
- [Variants](#variants)
- [Versions](#versions)
- [Comparison](#comparison)
- [Example commands](#example-commands)

### Setup

```sh
git clone git@github.com:PolymerLabs/lit-benchmarks.git
cd lit-benchmarks
npm install
npm run benchmarks
```

### Flags

Flag                      | Default     | Description
------------------------- | ----------- | --------------------------------
`--help`                  | `false`     | Show documentation
`--host`                  | `127.0.0.1` | Which host to run on
`--port`                  | `0`         | Which port to run on (`0` for random free)
`--name` / `-n`           | `*`         | Which benchmarks to run (`*` for all) ([details](#adding-benchmarks))
`--implementation` / `-i` | `lit-html`  | Which implementations to run (`*` for all) ([details](#adding-benchmarks))
`--variant` / `-v`        | `*`         | Which variants to run (`*` for all) ([details](#variants))
`--package-version` / `-p`| *(none)*    | Specify one or more dependency versions ([details](#versions))
`--browser` / `-b`        | `chrome`    | Which browsers to launch in automatic mode, comma-delimited (chrome, firefox)
`--baseline`              | `fastest`   | Which result to use as the baseline for comparison ([details](#comparison))
`--sample-size` / `-n`    | `50`        | How many times to run each benchmark
`--manual` / `-m`         | `false`     | Don't run automatically, just show URLs and collect results ([details](#manual-mode))
`--save` / `-s`           | *(none)*    | Save benchmark JSON data to this file ([details](#saving-data))
`--auto-sample`           | `true`      | Continuously sample until all runtime differences can be placed, with statistical significance, on one side or the other of all specified `--boundary` points 
`--boundaries`            | `-0.5,0.5`  | The boundaries to use when `--auto-sample` is enabled (milliseconds, comma-delimited)
`--timeout`               | `5`         | The maximum number of minutes to spend auto-sampling

### Automatic mode

The default mode automatically launches Chrome with the selected
benchmarks/implementations (all lit-html benchmarks by default), runs the
benchmarks, reports the results back to the server, and prints them to the
terminal.

### Sample size

By default, a minimum of 50 samples are taken from each benchmark configuration.
The preliminary results from these samples may or may not be precise enough to
allow you to to draw a statistically significant conclusion.

For example, if you are interested in knowing which of A and B are faster, but
you find that the confidence interval for the difference between the mean
runtimes of A and B *includes zero* (e.g. `[-0.4, 0.6] ms`), then it is clearly
not possible to draw a conclusion about whether A is faster than B or
vice-versa.

To help refine such inconclusive results after the initial 50 samples,
additional samples will be continuously drawn until either the configured
stopping condition is met, or until a timeout has expired (5 minutes by
default).

To configure the stopping condition for auto-sampling, use the `--boundaries`
flag. Samples will continue to be taken until it is no longer statistically
ambiguous whether a difference is either less than or greater than each of the
configured boundaries.

In the following visual example, we have set `--boundaries=-0.5,0.5` (the
default), meaning that we are interested in knowing whether A differs from B by
at least 0.5 milliseconds in either direction. The sample size automatically
increases until the confidence interval is narrow enough to place the estimated
difference squarely on one side or the other of both boundaries.

```
     <------------------------------->     n=50  ❌ -0.5 ❌ 0.5
               <------------------>        n=100 ✔️ -0.5 ❌ 0.5
                   <----->                 n=200 ✔️ -0.5 ✔️ 0.5

 |---------|---------|---------|---------| ms runtime B - A
-1       -0.5        0        0.5        1

n     = sample size
<---> = confidence interval for difference of mean runtimes
✔️    = resolved boundary
❌    = unresolved boundary
```

In the example, by `n=50` we are not sure whether A is faster or slower than B
by more than 0.5 ms. By `n=100` we have ruled out that B is faster than A by
more than 0.5 ms, but we're still not sure if it's slower by more than 0.5 ms.
By `n=200` we have also ruled out that B is slower than A by more than 0.5 ms,
so we stop sampling. Note that we still don't know which is *absolutely* faster,
we just know that whatever the difference is, it is neither faster nor slower
than 0.5.

Example boundaries | Question
------------------ | -----------
`0`                | Is X faster or slower than the baseline?
`0.5`              | Is X slower than the baseline by at least 0.5 milliseconds?
`-0.5`             | Is X faster than the baseline by at least 0.5 milliseconds?
`-0.5,0.5`         | Is X faster or slower than the baseline by at least 0.5 milliseconds?
`-1,-0.1,0,0.1,1`  | Is X at all, a little, or a lot faster or slower than the baseline?

Note that, if the actual difference is very close to a boundary, then it is
likely that the precision stopping condition will never be met, and the timeout
will expire.

### Manual mode

If the `--manual` or `-m` flag is set, then no benchmarks will run
automatically. Instead, URLs for all selected benchmarks/implementations will be
printed on the terminal, and the server will listen indefinitely. Visiting any
of these URLs in any browser (or any other valid benchmark URL on the host) will
run the benchmark, report the results back to the server, and print them to the
terminal.

### Saving data

Use the `--save <filename>` flag to save benchmarking results to a file. If the
file does not exist it will be created, otherwise it will be created.

The file format is one line per *session*, where a session is a JSON-encoded
[`BenchmarkSession`](https://github.com/PolymerLabs/lit-benchmarks/blob/master/server/src/types.ts)
object which contains an array of millisecond benchmark results along with
timestamp and system information.

In automatic mode, a single session will be appended after all benchmarks have
completed. In manual mode, a new session will be appended every time a benchmark
finishes.

### Adding benchmarks

To add a new benchmark or implementation, add a directory within the
`benchmarks/` directory following the layout:

```
benchmarks/
└── <implementation>/
   ├── package.json
   └── <benchmark>/
       ├── index.html
       └── index.js
```

Each implementation directory should have its own `package.json` to isolate
dependencies between implementations. Running `npm install` from the top-level
of the repo will automatically run `npm install` within each implementation
directory.

Benchmark `.js` files should
`import * as bench from '../../../client/lib/index.js'` and call
`bench.start()` and `bench.stop()` to mark the beginning and end times of the
benchmark. Optionally use `bench.config` to access the configuration object
defined by the variant (see next section).

```js
import * as bench from '/client/lib/index.js';
// Do any initial setup here.
bench.start();
// Do the work being measured here.
bench.stop();
```

Always import resources that are *outside* your benchmark directory using
absolute paths (e.g. the `client` library and files from `common/`) so that they
are resolved correctly when serving custom [versions](#versions). Likewise,
always import resources that are *inside* your benchmark directory using
relative paths (e.g. the benchmark's `.js` file).

To avoid collisions with special files and directories, implementation and
benchmark directories cannot be named `versions`, `common`, `node_modules`,
`package.json`, or `package-lock.json`.

Run `npm run format` from the top-level of the repo to run clang-format on all
`.js` files in `benchmarks/` (along with all `.ts` files in `client/` and
`server/`).

### Versions

By default, the version of a dependency library that a benchmark runs against is
the one installed by NPM according to the implementation directory's
`package.json` (usually the latest stable release).

However, it is often useful to run a benchmark on a specific dependency version,
or across *multiple versions of the same dependency*, e.g. to see the difference
between two different published versions, or between the GitHub master branch
and a local development branch.

Use the `--package-version` flag to specify a different version of a dependency
library to install and run against, instead of the default one. To specify
multiple versions, use the flag multiple times. The format of this flag is:

`<implementation>/<label>=<pkg>@<version>[,<pkg@version>],...]`

Part              | Description
----------------- | -----------
`implementation`  | The implementation directory name whose dependencies we are changing (e.g. `lit-html`).
`label`           | An arbitrary concise name for this version (e.g. `master`, `local`, `1.x`).
`pkg`             | The NPM package name (e.g. `lit-html`). Must already appear in the implementation's `package.json`.
`version`         | Any valid [NPM version descriptor](https://docs.npmjs.com/files/package.json#dependencies) (e.g. `Polymer/lit-html#master`, `$HOME/lit-html`, `^1.0.0`).

To include the default version when using this flag, use
`<implementation>/default`.

For example, here we configure 3 versions of `lit-html` to run benchmarks
against: the GitHub master branch, a local development git clone, and the latest
1.x version published to NPM:

```sh
npm run benchmarks --
--package-version=lit-html/master=lit-html@github:Polymer/lit-html#master \
--package-version=lit-html/local=lit-html@$HOME/lit-html \
--package-version=lit-html/1.x=lit-html@^1.0.0
```

When you use the `--package-version` flag, the following happens:
- A directory `<implementation>/versions/<label>` is created.
- A copy of `<implementation>/package.json` is written to `.../<label>/package.json`
  and modified according to the new dependency versions you specified.
- `npm install` is run in this directory.
- Benchmarks are run from URLs of the form `<implementation>/versions/<label>`.
  URL paths within `node_modules/` are served from the version directory (to get
  your new versions), while other URLs (i.e. the benchmarks themselves) are
  mapped back to the main `<implementation>` directory.

### Variants

By default, each `benchmarks/<implementation>/<benchmark>/` directory represents
one benchmark, which will be executed by launching the `index.html` found in
that directory. It some cases, however, it may be convenient to define multiple
*variants* of a benchmark implementation.

If a `benchmarks.json` file is found in a `<benchmark>` directory, then it will
be read to look for a list of variants.

Option            | Description
------------------| -------------------------------
`variants`        | A list of variant objects for this benchmark
`variants.name`   | A label for this variant
`variants.config` | An arbitrary object which will be passed to the benchmark function

For example, a benchmark that performs some recursive procedure to a
parameterized depth might define two variants in its `benchmarks.json`:

```js
{
  "variants": [
    {
      "name": "shallow",
      "config": {
        "depth": 10
      }
    },
    {
      "name": "deep",
      "config": {
        "depth": 1000
      }
    }
  ]
}
```

And might have an implementation like this:

```js
bench.start();
recurse(bench.config.depth);
bench.stop();
```

### Comparison

If more than one benchmark configuration is running, then comparative results
between them will be presented. One result will be used as the *baseline*, and
the others will report data in terms of its relative slowdown (result ms -
baseline ms). By default the fastest result will be used as the baseline, but
this can be changed with the `--baseline` flag.

Option                              | Description
------------------------------------| -------------------------------
`fastest`                           | Use the lowest estimated mean runtime as the baseline.
`slowest`                           | Use the highest estimated mean runtime as the baseline.
`name=<name>,version=<version>,...` | One or more comma-delimited `key=val` filters for narrowing down the baseline. At least one filter is required, and an error will be thrown if the selection is ambiguous. Valid filter keys: `name`, `variant`, `implementation`, `version`, `browser`.

### Example commands

##### Run all lit-html benchmarks

```sh
npm run benchmarks
```

##### Run all benchmarks with all implementations

```sh
npm run benchmarks -- --implementation=* --benchmarks=*
```

##### Run a specific benchmark implementation

```sh
npm run benchmarks -- --implementation=incremental-dom --benchmarks=recurse
```

##### Run benchmarks manually and log all results

```sh
npm run benchmarks -- --manual
```
