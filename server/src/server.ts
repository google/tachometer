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

import * as net from 'net';

import Koa = require('koa');
import mount = require('koa-mount');
import Router = require('koa-router');
import serve = require('koa-static');
import websockify = require('koa-websocket');

import {Deferred, BenchmarkSpec, BenchmarkResult, Run} from './types';

export class Server {
  private readonly server: net.Server;
  private readonly url: string;

  // Even though we're running benchmarks in series, we give each run an id and
  // make sure that we associate result messages with the correct run. This
  // prevents any spurrious race conditions and enables one runner to launch
  // multiple clients eventually.
  private currentRunId = 0;
  private readonly pendingRuns = new Map<string, Run>();

  constructor(root: string, port: number = 0) {
    const app = websockify(new Koa());
    app.use(mount('/', serve(root, {index: 'index.html'})));
    this.server = app.listen(port);
    const address = (this.server.address() as net.AddressInfo);

    const wsRouter = new Router();
    wsRouter.all('/test', async (context) => {
      context.websocket.on('message', this.onWebsocketMessage.bind(this));
    });
    app.ws.use(wsRouter.routes());

    let host = address.address;
    if (address.family === 'IPv6') {
      host = `[${host}]`;
    }
    this.url = `http://${host}:${address.port}`;
  }

  runBenchmark(spec: BenchmarkSpec):
      {url: string, results: Promise<BenchmarkResult[]>} {
    const id = (this.currentRunId++).toString();
    const run: Run = {id, spec, deferred: new Deferred()};
    this.pendingRuns.set(id, run);
    return {
      url: `${this.url}${spec.urlPath}?id=${id}`,
      results: run.deferred.promise,
    };
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

  private async onWebsocketMessage(message: string) {
    const data = JSON.parse(message);
    // Simple diagnostic that the client code loaded correctly
    if (data.type === 'start') {
      return;
    }

    if (data.type === 'result') {
      const runObject = this.pendingRuns.get(data.id);
      if (runObject === undefined) {
        console.error('unknown run', data.id);
        return;
      }
      runObject.deferred.resolve(data.benchmarks);
      return;
    }

    console.log('unknown message', data);
  }
}
