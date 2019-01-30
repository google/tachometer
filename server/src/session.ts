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

import * as systeminformation from 'systeminformation';
import {BenchmarkResult, BenchmarkSession} from './types';

export async function makeSession(results: BenchmarkResult[]):
    Promise<BenchmarkSession> {
  // TODO Add git info.
  const battery = await systeminformation.battery();
  const cpu = await systeminformation.cpu();
  const currentLoad = await systeminformation.currentLoad();
  const memory = await systeminformation.mem();
  return {
    benchmarks: results,
    datetime: new Date().toISOString(),
    system: {
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
      },
    },
  };
}
