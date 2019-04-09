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
import * as path from 'path';
import * as querystring from 'querystring';

import Koa = require('koa');
import mount = require('koa-mount');
import serve = require('koa-static');
import bodyParser = require('koa-bodyparser');
import {UAParser} from 'ua-parser-js';

import {BenchmarkResponse, Deferred, BenchmarkSpec, BenchmarkResult, PendingBenchmark} from './types';

export interface ServerOpts {
  host: string;
  port: number;
  benchmarksDir: string;
}

const clientDir = path.resolve(__dirname, '..', '..', 'client');

export class Server {
  readonly url: string;
  private readonly server: net.Server;

  // Even though we're running benchmarks in series, we give each run an id and
  // make sure that we associate result messages with the correct run. This
  // prevents any spurrious race conditions and enables one runner to launch
  // multiple clients eventually.
  private currentRunId = 0;
  private currentRunBytes = 0;
  private readonly pendingRuns = new Map<string, PendingBenchmark>();
  private resultSubmitted = new Deferred<BenchmarkResult>();

  static start(opts: ServerOpts): Promise<Server> {
    return new Promise((resolve) => {
      const server = http.createServer();
      server.listen(
          {host: opts.host, port: opts.port},
          () => resolve(new Server(server, opts)));
    });
  }

  constructor(server: http.Server, opts: ServerOpts) {
    this.server = server;

    const app = new Koa();
    app.use(bodyParser());
    app.use(mount('/submitResults', this.submitResults.bind(this)));
    app.use(this.rewriteVersionUrls.bind(this));
    app.use(this.recordBytesSent.bind(this));
    app.use(
        mount('/benchmarks', serve(opts.benchmarksDir, {index: 'index.html'})));
    app.use(mount('/client', serve(clientDir)));
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
    return `${this.url}/benchmarks/${spec.implementation}/` +
        (spec.version.label === 'default' ? '' :
                                            `versions/${spec.version.label}/`) +
        `${spec.name}/?${querystring.stringify(params)}`;
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

  private async recordBytesSent(ctx: Koa.Context, next: () => Promise<void>):
      Promise<void> {
    // Note this assumes serial runs, as we guarantee in automatic mode. If we
    // ever wanted to support parallel requests, we would require some kind of
    // session tracking.
    await next();
    if (typeof ctx.response.length === 'number') {
      this.currentRunBytes += ctx.response.length;
    } else if (ctx.status === 200) {
      console.log(
          `No response length for 200 response for ${ctx.url}, ` +
          `byte count may be inaccurate.`);
    }
  }

  /**
   * When serving specific versions, we want to serve any node_modules/ paths
   * from that specific version directory (since that's the whole point of
   * versions), but all other paths need to be re-mapped up to the grand-parent
   * implementation directory (since that's where the actual benchmark code is).
   */
  private async rewriteVersionUrls(ctx: Koa.Context, next: () => Promise<void>):
      Promise<void> {
    const urlParts = ctx.url.split('/');
    // We want to remap the first of these forms, but not the second or third:
    //   /benchmarks/<implementation>/versions/<version>/<name>/...
    //   /benchmarks/<implementation>/versions/<version>/node_modules/...
    //   /benchmarks/<implementation>/<name>/...
    //  0 1          2                3        4         5      6
    if (urlParts[1] === 'benchmarks' && urlParts[3] === 'versions' &&
        urlParts[5] !== 'node_modules') {
      urlParts.splice(3, 2);  // Remove the "versions/<version>" part.
      ctx.url = urlParts.join('/');
    }
    return next();
  }

  private async submitResults(ctx: Koa.Context) {
    const bytesSent = this.currentRunBytes;
    this.currentRunBytes = 0;  // Reset for next run.

    const response = ctx.request.body as BenchmarkResponse;
    const browser = new UAParser(ctx.headers['user-agent']).getBrowser();

    // URLs paths will be one of these two forms:
    //   /benchmarks/<implementation>/<name>/...
    //   /benchmarks/<implementation>/versions/<version>/<name>/...
    //  0 1          2                3        4         5      6
    const urlParts = response.urlPath.split('/');
    if (urlParts.length < 4 || urlParts[1] !== 'benchmarks') {
      console.error(`Unexpected response urlPath ${response.urlPath}`);
      return;
    }
    const implementation = urlParts[2];
    let name, version;
    // Note we assume that there are no benchmarks called "versions".
    if (urlParts[3] === 'versions') {
      version = urlParts[4];
      name = urlParts[5];
    } else {
      version = 'default';
      name = urlParts[3];
    }

    const result: BenchmarkResult = {
      runId: response.runId,
      name,
      variant: response.variant || '',
      implementation,
      version,
      millis: [response.millis],
      paintMillis: [],  // This will come from the performance logs.
      browser: {
        name: browser.name || '',
        version: browser.version || '',
      },
      bytesSent,
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
