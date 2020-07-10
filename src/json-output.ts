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

import {ResultStatsWithDifferences} from './stats';
import {BenchmarkResult} from './types';

export interface JsonOutputFile {
  benchmarks: Benchmark[];
}

interface Benchmark {
  name: string;
  mean: ConfidenceInterval;
  differences: Array<Difference|null>;
  samples: number[];
}

interface Difference {
  absolute: ConfidenceInterval;
  percentChange: ConfidenceInterval;
}

interface ConfidenceInterval {
  low: number;
  high: number;
}

export function jsonOutput(results: ResultStatsWithDifferences[]):
    JsonOutputFile {
  const benchmarks: Benchmark[] = [];
  for (const result of results) {
    const differences: Array<Difference|null> = [];
    for (const difference of result.differences) {
      if (difference === null) {
        differences.push(null);
      } else {
        differences.push({
          absolute: {
            low: difference.absolute.low,
            high: difference.absolute.high,
          },
          percentChange: {
            low: difference.relative.low * 100,
            high: difference.relative.high * 100,
          },
        });
      }
    }
    benchmarks.push({
      name: result.result.name,
      samples: result.result.millis,
      mean: {
        low: result.stats.meanCI.low,
        high: result.stats.meanCI.high,
      },
      differences,
    });
  }
  return {benchmarks};
}

// TODO(aomarks) Remove this in next major version.
export interface LegacyJsonOutputFormat {
  benchmarks: BenchmarkResult[];
  datetime: string;  // YYYY-MM-DDTHH:mm:ss.sssZ
  system: {
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
  };
}

// TODO(aomarks) Remove this in next major version.
export async function legacyJsonOutput(results: BenchmarkResult[]):
    Promise<LegacyJsonOutputFormat> {
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
