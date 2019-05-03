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

import Koa = require('koa');
import mount = require('koa-mount');
import send = require('koa-send');
import serve = require('koa-static');
import bodyParser = require('koa-bodyparser');
import {UAParser} from 'ua-parser-js';

import {BenchmarkResponse, Deferred, BenchmarkSpec} from './types';

export interface ServerOpts {
  host: string;
  ports: number[];
  benchmarksDir: string;
}

const clientLib = path.resolve(__dirname, '..', 'client', 'lib');

class Session {
  bytes: number = 0;
  userAgent: string = '';
}

export class Server {
  readonly url: string;
  private readonly server: net.Server;
  private session: Session|undefined;
  private deferredResults = new Deferred<BenchmarkResponse>();

  static start(opts: ServerOpts): Promise<Server> {
    const server = http.createServer();
    const ports = [...opts.ports];

    return new Promise((resolve, reject) => {
      const tryNextPort = () => {
        if (ports.length === 0) {
          reject(`No ports available, tried: ${opts.ports.join(', ')}`);
        } else {
          server.listen(
              {host: opts.host, port: ports.shift()},
              () => resolve(new Server(server, opts)));
        }
      };

      server.on('error', (e: {code?: string}) => {
        if (e.code === 'EADDRINUSE' || e.code === 'EACCES') {
          tryNextPort();
        } else {
          reject(e);
        }
      });

      tryNextPort();
    });
  }

  constructor(server: http.Server, opts: ServerOpts) {
    this.server = server;

    const app = new Koa();
    app.use(bodyParser());
    app.use(mount('/submitResults', this.submitResults.bind(this)));
    app.use(this.rewriteVersionUrls.bind(this));
    app.use(this.instrumentRequests.bind(this));
    app.use(
        mount('/benchmarks', serve(opts.benchmarksDir, {index: 'index.html'})));
    app.use(this.serveBenchLib.bind(this));
    this.server.on('request', app.callback());

    const address = (this.server.address() as net.AddressInfo);
    let host = address.address;
    if (address.family === 'IPv6') {
      host = `[${host}]`;
    }
    this.url = `http://${host}:${address.port}`;
  }

  /**
   * Mark the beginning of a session and reset instrumentation.
   */
  beginSession() {
    if (this.session !== undefined) {
      throw new Error('A session is already pending');
    }
    this.session = new Session();
    this.deferredResults = new Deferred();
  }

  /**
   * Mark the end of a session and return the data instrumented from it.
   */
  endSession(): {bytesSent: number, browser: {name: string, version: string}} {
    if (this.session === undefined) {
      throw new Error('No session is pending');
    }
    const bytesSent = this.session.bytes;
    const ua = new UAParser(this.session.userAgent).getBrowser();
    this.session = undefined;
    return {
      bytesSent,
      browser: {
        name: ua.name || '',
        version: ua.version || '',
      },
    };
  }

  specUrl(spec: BenchmarkSpec): string {
    return `${this.url}/benchmarks/${spec.implementation}/` +
        (spec.version.label === 'default' ? '' :
                                            `versions/${spec.version.label}/`) +
        `${spec.name}/${spec.queryString}`;
  }

  async nextResults(): Promise<BenchmarkResponse> {
    return this.deferredResults.promise;
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

  private async instrumentRequests(ctx: Koa.Context, next: () => Promise<void>):
      Promise<void> {
    const session = this.session;
    if (session === undefined) {
      return next();
    }

    session.userAgent = ctx.headers['user-agent'];
    // Note this assumes serial runs, as we guarantee in automatic mode. If we
    // ever wanted to support parallel requests, we would require some kind of
    // session tracking.
    await next();
    if (typeof ctx.response.length === 'number') {
      session.bytes += ctx.response.length;
    } else if (ctx.status === 200) {
      console.log(
          `No response length for 200 response for ${ctx.url}, ` +
          `byte count may be inaccurate.`);
    }
  }

  private async serveBenchLib(ctx: Koa.Context, next: () => Promise<void>) {
    if (ctx.path === '/bench.js') {
      await send(ctx, 'bench.js', {root: clientLib});
    } else {
      await next();
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
    this.deferredResults.resolve(ctx.request.body as BenchmarkResponse);
    ctx.body = 'ok';
  }
}
