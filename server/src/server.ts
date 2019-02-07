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

import * as http from 'http';
import * as net from 'net';
import * as querystring from 'querystring';

import Koa = require('koa');
import mount = require('koa-mount');
import serve = require('koa-static');
import bodyParser = require('koa-bodyparser');
import {UAParser} from 'ua-parser-js';

import {BenchmarkResponse, Deferred, BenchmarkSpec, BenchmarkResult, PendingBenchmark} from './types';

export class Server {
  readonly url: string;
  private readonly server: net.Server;

  // Even though we're running benchmarks in series, we give each run an id and
  // make sure that we associate result messages with the correct run. This
  // prevents any spurrious race conditions and enables one runner to launch
  // multiple clients eventually.
  private currentRunId = 0;
  private readonly pendingRuns = new Map<string, PendingBenchmark>();
  private resultSubmitted = new Deferred<BenchmarkResult>();

  static start(opts: {host: string, port: number, rootDir: string}):
      Promise<Server> {
    return new Promise((resolve) => {
      const server = http.createServer();
      server.listen(
          {host: opts.host, port: opts.port},
          () => resolve(new Server(server, opts.rootDir)));
    });
  }

  constructor(server: http.Server, rootDir: string) {
    this.server = server;

    const app = new Koa();
    app.use(bodyParser());
    app.use(mount('/submitResults', this.submitResults.bind(this)));
    app.use(mount('/', serve(rootDir, {index: 'index.html'})));
    this.server.on('request', app.callback());

    const address = (this.server.address() as net.AddressInfo);
    let host = address.address;
    if (address.family === 'IPv6') {
      host = `[${host}]`;
    }
    this.url = `http://${host}:${address.port}`;
  }

  runBenchmark(spec: BenchmarkSpec):
      {url: string, result: Promise<BenchmarkResult>} {
    const id = (this.currentRunId++).toString();
    const run: PendingBenchmark = {
      id,
      spec,
      deferred: new Deferred<BenchmarkResult>()
    };
    this.pendingRuns.set(id, run);
    return {
      url: this.specUrl(spec, id),
      result: run.deferred.promise,
    };
  }

  specUrl(spec: BenchmarkSpec, id?: string): string {
    const params: {
      runId?: string,
      variant?: string,
      config?: string,
    } = {};
    if (id !== undefined) {
      params.runId = id;
    }
    if (spec.variant !== undefined) {
      params.variant = spec.variant;
    }
    if (spec.config !== undefined) {
      params.config = JSON.stringify(spec.config);
    }
    return `${this.url}/benchmarks/${spec.implementation}/${spec.name}/?` +
        querystring.stringify(params);
  }

  async * streamResults(): AsyncIterableIterator<BenchmarkResult> {
    while (true) {
      yield await this.resultSubmitted.promise;
    }
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.server.close((error: unknown) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private async submitResults(ctx: Koa.Context) {
    const response = ctx.request.body as BenchmarkResponse;
    const browser = new UAParser(ctx.headers['user-agent']).getBrowser();
    const urlParts = response.urlPath.split('/').filter((part) => part !== '');
    let name, implementation;
    if (urlParts[urlParts.length - 1].includes('.')) {
      name = urlParts[urlParts.length - 2];
      implementation = urlParts[urlParts.length - 3];
    } else {
      name = urlParts[urlParts.length - 1];
      implementation = urlParts[urlParts.length - 2];
    }
    const result: BenchmarkResult = {
      runId: response.runId,
      name,
      variant: response.variant,
      implementation,
      millis: response.millis,
      browser: {
        name: browser.name || '',
        version: browser.version || '',
      },
    };
    this.resultSubmitted.resolve(result);
    this.resultSubmitted = new Deferred();
    if (response.runId !== undefined) {
      const pendingRun = this.pendingRuns.get(response.runId);
      if (pendingRun === undefined) {
        console.error('unknown run', response.runId);
      } else {
        pendingRun.deferred.resolve(result);
      }
    }
    ctx.body = 'ok';
  }
}
