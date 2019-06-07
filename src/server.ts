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

import {parse as babelParse} from '@babel/parser';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';

import Koa = require('koa');
import mount = require('koa-mount');
import send = require('koa-send');
import serve = require('koa-static');
import bodyParser = require('koa-bodyparser');
import {nodeResolve} from 'koa-node-resolve';

import {BenchmarkResponse, Deferred} from './types';

export interface ServerOpts {
  host: string;
  ports: number[];
  root: string;
  mountPoints: MountPoint[];
  resolveBareModules: boolean;
}

export interface MountPoint {
  diskPath: string;
  urlPath: string;
}

const clientLib = path.resolve(__dirname, '..', 'client', 'lib');

interface Session {
  bytesSent: number;
  userAgent: string;
}

export class Server {
  readonly url: string;
  private readonly server: net.Server;
  private session: Session = {bytesSent: 0, userAgent: ''};
  private deferredResults = new Deferred<BenchmarkResponse>();

  static start(opts: ServerOpts): Promise<Server> {
    const server = http.createServer();
    const ports = [...opts.ports];

    return new Promise((resolve, reject) => {
      const tryNextPort = () => {
        if (ports.length === 0) {
          reject(`No ports available, tried: ${opts.ports.join(', ')}`);
        } else {
          server.listen({host: opts.host, port: ports.shift()});
        }
      };

      server.on('listening', () => resolve(new Server(server, opts)));

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
    app.use(this.instrumentRequests.bind(this));
    app.use(this.serveBenchLib.bind(this));

    if (opts.resolveBareModules === true) {
      app.use(nodeResolve({
        root: opts.root,
        // Only log errors.
        logger: {...console, debug: undefined, info: undefined},
        // Enable latest JS syntax.
        jsParser: (js) => babelParse(js, {
          sourceType: 'unambiguous',
          plugins: [
            'dynamicImport',
            'importMeta',
          ],
        }),
      }));
    }
    for (const {diskPath, urlPath} of opts.mountPoints) {
      app.use(mount(urlPath, serve(diskPath, {index: 'index.html'})));
    }

    this.server.on('request', app.callback());
    const address = (this.server.address() as net.AddressInfo);
    let host = address.address;
    if (address.family === 'IPv6') {
      host = `[${host}]`;
    }
    this.url = `http://${host}:${address.port}`;
  }

  /**
   * Mark the end of one session, return the data instrumented from it, and
   * begin a new session.
   */
  endSession(): Session {
    const session = this.session;
    this.session = {bytesSent: 0, userAgent: ''};
    this.deferredResults = new Deferred();
    return session;
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
    // Note this assumes serial runs, as we guarantee in automatic mode.
    // If we ever wanted to support parallel requests, we would require
    // some kind of session tracking.
    await next();
    if (typeof ctx.response.length === 'number') {
      session.bytesSent += ctx.response.length;
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

  private async submitResults(ctx: Koa.Context) {
    this.deferredResults.resolve(ctx.request.body as BenchmarkResponse);
    ctx.body = 'ok';
  }
}
