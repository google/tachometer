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

import * as child_process from 'child_process';
import {PackageJson, PackageVersion} from './types';

/**
 * Parse a string of the form:
 *   <implementation>/<label>=<pkg>@<version>[,<package>@<version>],...
 */
export function parsePackageVersion(flags: string[]):
    Map<string, PackageVersion[]> {
  const versions = new Map<string, PackageVersion[]>();
  for (const flag of flags) {
    const match = flag.match(/(.+?)\/(?:(default)|(?:(.+?)=(.+)))/);
    if (match === null) {
      throw new Error(`Invalid package-version ${flag}`);
    }
    let [, implementation, isDefault, label, packageVersions] = match;
    const dependencies: {[pkg: string]: string} = {};
    if (isDefault) {
      label = 'default';
    } else {
      for (const pv of packageVersions.split(',')) {
        const pvMatch = pv.match(/(.+)@(.+)/);
        if (pvMatch === null) {
          throw new Error(`Invalid package-version ${flag} (${pv})`);
        }
        const [, pkg, version] = pvMatch;
        dependencies[pkg] = version;
      }
    }
    let arr = versions.get(implementation);
    if (arr === undefined) {
      arr = [];
      versions.set(implementation, arr);
    }
    arr.push({label, dependencies});
  }
  return versions;
}

/**
 * Apply some package version override to a parsed package.json.
 */
export function applyVersion(
    version: PackageVersion, packageJson: PackageJson): PackageJson {
  return {
    ...packageJson,
    dependencies: {
      ...packageJson.dependencies,
      ...version.dependencies,
    }
  };
}

/**
 * Run "npm install" in the given directory.
 */
export async function npmInstall(cwd: string): Promise<void> {
  return new Promise(
      (resolve, reject) =>
          child_process.execFile('npm', ['install'], {cwd}, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          }));
}
