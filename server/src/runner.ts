/**
 * @license
 * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

require('source-map-support').install();
require('chromedriver');

import {AddressInfo, Server} from 'net';
import * as path from 'path';
import * as fs from 'fs-extra';

import {Builder, WebDriver} from 'selenium-webdriver';
import * as systeminformation from 'systeminformation';

import Koa = require('koa');
import mount = require('koa-mount');
import Router = require('koa-router');
import serve = require('koa-static');
import websockify = require('koa-websocket');
import commandLineArgs = require('command-line-args');
import {promisify} from 'util';

// const util = require('util');
// const exec = util.promisify(require('child_process').exec);

interface Run {
  id: string;
  name: string;
  deferred: Deferred<BenchmarkResult[]>;
}

// interface RunResult {
//   type: 'result';
//   id: string;
//   benchmarks: BenchmarkResult[];
// }

interface BenchmarkResult {
  name: string;
  runs: number[];
}

// TODO: add date, time, git branch name, etc
interface RunData {
  name: string;
  date: Date;
  benchmarks: BenchmarkResult[];
  cpu: {
    manufacturer: string,
    model: string,
    family: string,
    speed: string,
    cores: number,
  };
  load: {
    average: number,
    current: number,
  };
  battery: {
    hasBattery: boolean,
    connected: boolean,
  };
  memory: {
    total: number,
    free: number,
    used: number,
    active: number,
    available: number,
  };
}

/**
const getGitInfo = async () => {
  try {
    const { stdout, stderr } = await exec('git', ['rev-parse', 'HEAD']);
    console.log({ stdout, stderr });
  } catch (e) {
    console.error(e);
  }
};
*/

const getRunData = async(
    name: string, benchmarkResults: BenchmarkResult[]): Promise<RunData> => {
  // getGitInfo();
  const battery = (await systeminformation.battery()) as any as {
    hasbattery: boolean,
    acconnected: boolean,
  };
  const cpu = await systeminformation.cpu();
  const currentLoad = await systeminformation.currentLoad();
  const memory = await systeminformation.mem();
  return {
    name,
    date: new Date(),
    benchmarks: benchmarkResults,
    cpu: {
      manufacturer: cpu.manufacturer,
      model: cpu.model,
      family: cpu.family,
      speed: cpu.speed,
      cores: cpu.cores,
    },
    load: {
      average: currentLoad.avgload,
      current: currentLoad.currentload,
    },
    battery: {
      hasBattery: battery.hasbattery,
      connected: battery.acconnected,
    },
    memory: {
      total: memory.total,
      free: memory.free,
      used: memory.used,
      active: memory.active,
      available: memory.available,
    }
  };
};


class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (error: Error) => void;

  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }
}

class Runner {
  static async create() {
    // Create a function to open a browser window for the benchmark
    const driver = await new Builder().forBrowser('chrome').build();
    return new Runner(driver);
  }


  // Even though we're running benchmarks in series, we give each run an id and
  // make sure that we associate result messages with the correct run. This
  // prevents any spurrious race conditions and enables one runner to launch
  // multiple clients eventually.
  readonly pendingRuns = new Map<string, Run>();
  currentRunId = 0;
  driver: WebDriver;
  server: Server;

  constructor(driver: WebDriver) {
    this.driver = driver;
    // Enable WebSockets on the server
    const app = websockify(new Koa());

    // Serve the benchmark client static files
    const benchmarkClientDir = path.resolve(__dirname, '../../');
    app.use(mount('/client/lit-html/', serve(benchmarkClientDir, {
                    index: 'index.html',
                  })));

    // Set up WebSocket handler for the browser to send results to
    const wsRouter = new Router();
    wsRouter.all('/test', async (context) => {
      context.websocket.on('message', async (message: string) => {
        const data = JSON.parse(message);
        // console.log({data});

        // Simple diagnostic that the client code loaded correctly
        if (data.type === 'start') {
          console.log(`Benchmark running: ${this.pendingRuns.get(data.id)}`);
          return;
        }

        if (data.type === 'result') {
          console.log(`Benchmark complete: ${data.id}`);
          const runObject = this.pendingRuns.get(data.id);
          if (runObject === undefined) {
            console.error('unknown run', data.id);
            return;
          }
          runObject.deferred.resolve(data.benchmarks);
          return;
        }

        console.log('unknown message', data);
      });
    });
    app.ws.use(wsRouter.routes());

    this.server = app.listen();
    const port = (this.server.address() as AddressInfo).port;
    console.log(`lit-html benchmark server listening at ${port}`);
  }

  async openBenchmarkInBrowser(name: string, id: string) {
    const port = (this.server.address() as AddressInfo).port;
    const url = `http://localhost:${port}/client/lit-html/benchmarks/${
        name}/index.html?id=${id}`;
    await this.driver.get(url);
  }

  async runBenchmark(name: string): Promise<BenchmarkResult[]> {
    const id = (this.currentRunId++).toString();
    const run: Run = {
      id,
      name,
      deferred: new Deferred(),
    };
    this.pendingRuns.set(id, run);
    await this.openBenchmarkInBrowser(name, id);
    return run.deferred.promise;
  }

  async stop() {
    await Promise.all([
      this.driver.close(),
      promisify(this.server.close.bind(this.server))(),
    ]);
  }
}


const saveRun = async (benchmarkName: string, newData: any) => {
  const filename = path.resolve(
      __dirname, '..', '..', 'benchmarks', benchmarkName, 'runs.json');
  let data: any;
  let contents: string|undefined;
  try {
    contents = await fs.readFile(filename, 'utf-8');
  } catch (e) {
  }
  if (contents !== undefined && contents.trim() !== '') {
    data = JSON.parse(contents);
  }
  if (data === undefined) {
    data = {};
  }
  if (data.runs === undefined) {
    data.runs = [];
  }
  data.runs.push(newData);
  fs.writeFile(filename, JSON.stringify(data));
};

const run = async (name: string) => {
  const runner = await Runner.create();
  const results = await runner.runBenchmark(name);
  console.log(JSON.stringify(results));
  const data = await getRunData(name, results);
  console.log({data});
  await saveRun(name, data);
  runner.stop();
};

const optionDefinitions: commandLineArgs.OptionDefinition[] = [
  {name: 'name', type: String, defaultOption: true},
  {name: 'save', alias: 'S', type: Boolean},
  {name: 'verbose', alias: 'v', type: Boolean},
];
const args = commandLineArgs(optionDefinitions);
console.log({args});
run('recurse');
