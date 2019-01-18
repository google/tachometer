# Lit Benchmarks

WIP benchmarks for [lit-html](https://github.com/Polymer/lit-html).

### Setup

```sh
git clone git@github.com:PolymerLabs/lit-benchmarks.git
cd lit-benchmarks
npm install
```

### Run all lit-html benchmarks

```sh
npm run benchmarks
```

### Run all benchmark implementations

```sh
npm run benchmarks -- --implementation=* --benchmarks=*
```

### Run a specific benchmark implementation

```sh
npm run benchmarks -- --implementation=incremental-dom --benchmarks=recurse
```
