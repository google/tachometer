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

import * as fs from 'fs-extra';
import * as path from 'path';

import commandLineArgs = require('command-line-args');
import commandLineUsage = require('command-line-usage');

import {BenchmarkSpec} from './types';
import {run} from './runner';

const repoRoot = path.resolve(__dirname, '..', '..');

const optDefs: commandLineUsage.OptionDefinition[] = [
  {
    name: 'help',
    description: 'Show this documentation',
    type: Boolean,
    defaultValue: false,
  },
  {
    name: 'benchmark',
    description: 'Which benchmarks to run',
    alias: 'b',
    type: String,
    defaultValue: '*',
  },
  {
    name: 'implementation',
    description: 'Which implementations to run',
    alias: 'i',
    type: String,
    defaultValue: 'lit-html',
  },
];

interface Opts {
  help: boolean;
  benchmark: string;
  implementation: string;
}

async function specsFromOpts(opts: Opts): Promise<BenchmarkSpec[]> {
  const specs = [];
  let impls;
  if (opts.implementation === '*') {
    impls = await fs.readdir(path.join(repoRoot, 'benchmarks'));
  } else {
    impls = opts.implementation.split(',');
  }
  for (const implementation of impls) {
    const dir = path.join(repoRoot, 'benchmarks', implementation);
    let benchmarks;
    if (opts.benchmark === '*') {
      benchmarks = await fs.readdir(dir);
    } else {
      benchmarks = opts.benchmark.split(',');
    }
    for (const benchmark of benchmarks) {
      specs.push({
        benchmark,
        implementation,
        urlPath: `/benchmarks/${implementation}/${benchmark}/index.html`,
      });
    }
  }
  return specs;
}

async function main() {
  const opts = commandLineArgs(optDefs) as Opts;
  if (opts.help) {
    console.log(commandLineUsage([{
      header: 'lit-benchmarks-runner',
      optionList: optDefs,
    }]));
    return;
  }
  const specs = await specsFromOpts(opts);
  for (const spec of specs) {
    await run(spec);
  }
}

main();
