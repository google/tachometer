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
import * as fsExtra from 'fs-extra';
import * as path from 'path';

import {BenchmarkSpec, NpmPackageJson, PackageDependencyMap, PackageVersion} from './types';

/**
 * Parse an array of strings of the form:
 *   <implementation>/<label>=<pkg>@<version>[,<package>@<version>],...
 */
export function parsePackageVersions(flags: string[]):
    Map<string, PackageVersion[]> {
  const versions = new Map<string, PackageVersion[]>();
  const uniqueImplLabels = new Set<string>();

  for (const flag of flags) {
    // Match <implementation>/<label>=<dependencyOverrides>
    const flagMatch = flag.match(/(.+?)\/(?:(default)|(?:(.+?)=(.+)))/);
    if (flagMatch === null) {
      throw new Error(`Invalid package-version format: "${flag}"`);
    }
    const [, implementation, isDefault, label, packageVersions] = flagMatch;
    const dependencyOverrides: {[pkg: string]: string} = {};

    if (isDefault === undefined) {
      const implLabel = `${implementation}/${label}`;
      if (uniqueImplLabels.has(implLabel)) {
        throw new Error(
            `package-version label "${implLabel}" was used more than once`);
      }
      uniqueImplLabels.add(implLabel);

      for (const pv of packageVersions.split(',')) {
        // Match each <pkg>@<version>
        const pvMatch = pv.match(/(.+)@(.+)/);
        if (pvMatch === null) {
          throw new Error(
              `Invalid package-version format: ` +
              `"${pv}" is not a valid dependency version`);
        }
        const [, pkg, version] = pvMatch;
        dependencyOverrides[pkg] = version;
      }
    }

    let arr = versions.get(implementation);
    if (arr === undefined) {
      arr = [];
      versions.set(implementation, arr);
    }
    arr.push({
      label: isDefault !== undefined ? 'default' : label,
      dependencyOverrides
    });
  }
  return versions;
}

/**
 * Create a copy of an NPM package.json object, but with some or all of its
 * dependencies overriden according to the given override map.
 */
function overrideNpmDependencies(
    packageJson: NpmPackageJson,
    overrides: PackageDependencyMap): NpmPackageJson {
  return {
    ...packageJson,
    dependencies: {
      ...packageJson.dependencies,
      ...overrides,
    }
  };
}

/**
 * Run "npm install" in the given directory.
 */
async function npmInstall(cwd: string): Promise<void> {
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

/**
 * Set up all <implementation>/version/<label> directories by copying the parent
 * package.json, applying dependency overrides to it, and running "npm install".
 */
export async function prepareVersionDirectories(
    rootDir: string, specs: BenchmarkSpec[]): Promise<void> {
  for (const spec of specs) {
    if (spec.version.label === 'default') {
      // This is just the main implementation installation. We assume it's
      // already been setup by the main npm install process.
      continue;
    }
    const implDir = path.join(rootDir, 'benchmarks', spec.implementation);
    const versionDir = path.join(implDir, 'versions', spec.version.label);
    if (await fsExtra.pathExists(versionDir)) {
      // TODO(aomarks) If the user specified new dependencies for the same
      // version label, it probably makes sense to delete the version directory
      // and install it again. We could read the package.json and check if the
      // versions differ.
      continue;
    }
    console.log(`Installing ${spec.implementation}/${spec.version.label} ...`);
    await fsExtra.ensureDir(versionDir);
    const packageJson =
        await fsExtra.readJson(path.join(implDir, 'package.json')) as
        NpmPackageJson;
    const newPackageJson =
        overrideNpmDependencies(packageJson, spec.version.dependencyOverrides);
    await fsExtra.writeJson(
        path.join(versionDir, 'package.json'), newPackageJson, {spaces: 2});
    await npmInstall(versionDir);
  }
}
