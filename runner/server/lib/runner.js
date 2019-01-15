"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
require('source-map-support').install();
require('chromedriver');
const path = require("path");
const fs = require("fs-extra");
const selenium_webdriver_1 = require("selenium-webdriver");
const systeminformation = require("systeminformation");
const Koa = require("koa");
const mount = require("koa-mount");
const Router = require("koa-router");
const serve = require("koa-static");
const websockify = require("koa-websocket");
const commandLineArgs = require("command-line-args");
const util_1 = require("util");
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const getGitInfo = async () => {
    try {
        const { stdout, stderr } = await exec('git', ['rev-parse', 'HEAD']);
        console.log({ stdout, stderr });
    }
    catch (e) {
        console.error(e);
    }
};
const getRunData = async (name, benchmarkResults) => {
    getGitInfo();
    const battery = (await systeminformation.battery());
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
class Deferred {
    constructor() {
        this.promise = new Promise((res, rej) => {
            this.resolve = res;
            this.reject = rej;
        });
    }
}
class Runner {
    constructor(driver) {
        // Even though we're running benchmarks in series, we give each run an id and
        // make sure that we associate result messages with the correct run. This
        // prevents any spurrious race conditions and enables one runner to launch
        // multiple clients eventually.
        this.pendingRuns = new Map();
        this.currentRunId = 0;
        this.driver = driver;
        // Enable WebSockets on the server
        const app = websockify(new Koa());
        // Serve the benchmark client static files
        const benchmarkClientDir = path.resolve(__dirname, '../../../');
        app.use(mount('/client/lit-html/', serve(benchmarkClientDir, {
            index: 'index.html',
        })));
        // Set up WebSocket handler for the browser to send results to
        const wsRouter = new Router();
        wsRouter.all('/test', async (context) => {
            context.websocket.on('message', async (message) => {
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
        const port = this.server.address().port;
        console.log(`lit-html benchmark server listening at ${port}`);
    }
    static async create() {
        // Create a function to open a browser window for the benchmark
        const driver = await new selenium_webdriver_1.Builder().forBrowser('chrome').build();
        return new Runner(driver);
    }
    async openBenchmarkInBrowser(name, id) {
        const port = this.server.address().port;
        const url = `http://localhost:${port}/client/lit-html/benchmark/benchmarks/${name}/index.html?id=${id}`;
        await this.driver.get(url);
    }
    async runBenchmark(name) {
        const id = (this.currentRunId++).toString();
        const run = {
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
            util_1.promisify(this.server.close.bind(this.server))(),
        ]);
    }
}
const saveRun = async (benchmarkName, newData) => {
    // console.log(process.cwd());
    let data;
    let contents;
    try {
        contents = await fs.readFile(`./benchmark/benchmarks/${benchmarkName}/runs.json`, 'utf-8');
    }
    catch (e) {
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
    fs.writeFile(`./benchmark/benchmarks/${benchmarkName}/runs.json`, JSON.stringify(data));
};
const run = async (name) => {
    const runner = await Runner.create();
    const results = await runner.runBenchmark(name);
    console.log(JSON.stringify(results));
    const data = await getRunData(name, results);
    console.log({ data });
    await saveRun(name, data);
    runner.stop();
};
const optionDefinitions = [
    { name: 'name', type: String, defaultOption: true },
    { name: 'save', alias: 'S', type: Boolean },
    { name: 'verbose', alias: 'v', type: Boolean },
];
const args = commandLineArgs(optionDefinitions);
console.log({ args });
run('recurse');
//# sourceMappingURL=runner.js.map