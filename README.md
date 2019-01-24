# Lit Benchmarks

Benchmarks for evaluating the performance of
[lit-html](https://github.com/Polymer/lit-html), along with alternative
implementations.

## Contents

- [Setup](#setup)
- [Flags](#flags)
- [Automatic mode](#automatic-mode)
- [Manual mode](#manual-mode)
- [Adding benchmarks](#adding-benchmarks)
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
`--benchmark` / `-b`      | `*`         | Which benchmarks to run (`*` for all)
`--implementation` / `-i` | `lit-html`  | Which implementations to run (`*` for all)
`--trials` / `-t`         | `10`        | How many times to run each benchmark
`--manual` / `-m`         | `false`     | Don't run automatically, just show URLs and collect results

### Automatic mode

The default mode automatically launches Chrome with the selected
benchmarks/implementations (all lit-html benchmarks by default), runs the
benchmarks, reports the results back to the server, and prints them to the
terminal.

### Manual mode

If the `--manual` or `-m` flag is set, then no benchmarks will run
automatically. Instead, URLs for all selected benchmarks/implementations will be
printed on the terminal, and the server will listen indefinitely. Visiting any
of these URLs in any browser (or any other valid benchmark URL on the host) will
run the benchmark, report the results back to the server, and print them to the
terminal.

### Adding benchmarks

To add a new benchmark or implementation, add a directory within the
`benchmarks/` directory following the layout:

```
benchmarks/
└── <implementation>/
   └── <benchmark>/
       ├── index.html
       └── index.js
```

Each implementation directory should have its own `package.json` to isolate
dependencies between implementations. Running `npm install` from the top-level
of the repo will automatically run `npm install` within each implementation
directory.

Benchmark `.js` files should `import {registerBenchmark} from
'../../../client/lib/index.js';` and call `registerBenchmark(<fn>);` once, where
`<fn>` is the function that implements the benchmark. The registered benchmark
will begin running after a `setTimeout`. Timing will begin immediately before
calling `<fn>`. If `<fn>` returns a promise then timing will end after awaiting
that promise, otherwise immediately after `<fn>` returns.

Run `npm run format` from the top-level of the repo to run clang-format on all
`.js` files in `benchmarks/` (along with all `.ts` files in `client/` and
`server/`).

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
