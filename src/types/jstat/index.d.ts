/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

declare module 'jstat' {
  /** https://jstat.github.io/all.html#jStat.studentt.inv */
  export const studentt: {
    inv(p: number, dof: number): number;
  };

  /** https://jstat.github.io/all.html#randn */
  export function randn(n: number, m: number): [number[]];
}
