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

import Koa = require('koa');
import mount = require('koa-mount');
import serve = require('koa-static');
import bodyParser = require('koa-bodyparser');
import {UAParser} from 'ua-parser-js';

import {Deferred, BenchmarkSpec, BenchmarkResult, Result, Run} from './types';

export class Server {
  readonly url: string;
  private readonly server: net.Server;

  // Even though we're running benchmarks in series, we give each run an id and
  // make sure that we associate result messages with the correct run. This
  // prevents any spurrious race conditions and enables one runner to launch
  // multiple clients eventually.
  private currentRunId = 0;
  private readonly pendingRuns = new Map<string, Run>();
  private resultSubmitted = new Deferred<Result>();

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

  runBenchmark(spec: BenchmarkSpec): {url: string, result: Promise<Result>} {
    const id = (this.currentRunId++).toString();
    const run: Run = {id, spec, deferred: new Deferred<Result>()};
    this.pendingRuns.set(id, run);
    return {
      url: `${this.url}${spec.urlPath}?id=${id}`,
      result: run.deferred.promise,
    };
  }

  async * streamResults(): AsyncIterableIterator<Result> {
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
    const data = ctx.request.body as {
      id: string | undefined | null,
      benchmarks: BenchmarkResult[],
    };
    const browser = new UAParser(ctx.headers['user-agent']).getBrowser();
    const result = {
      ms: data.benchmarks[0].runs[0],
      browser: {
        name: browser.name || '',
        version: browser.version || '',
      },
    };
    this.resultSubmitted.resolve(result);
    this.resultSubmitted = new Deferred();
    if (data.id != null) {
      const pendingRun = this.pendingRuns.get(data.id);
      if (pendingRun === undefined) {
        console.error('unknown run', data.id);
      } else {
        pendingRun.deferred.resolve(result);
      }
    }
  }
}
