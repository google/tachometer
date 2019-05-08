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
import * as crypto from 'crypto';
import * as fsExtra from 'fs-extra';
import * as path from 'path';

import {MountPoint} from './server';
import {BenchmarkSpec, NpmPackageJson, PackageDependencyMap, PackageVersion} from './types';

/**
 * Parse an array of strings of the form <package>@<version>.
 */
export function parsePackageVersions(flags: string[]): PackageVersion[] {
  const versions: PackageVersion[] = [];
  for (const flag of flags) {
    const match = flag.match(/^(?:(.+)=)?(.+)@(.+)$/);
    if (match === null) {
      throw new Error(`Invalid package format ${flag}`);
    }
    const [, label, dep, version] = match;
    versions.push({
      label: label || `${dep}@${version}`,
      dependencyOverrides: {
        [dep]: version,
      },
    });
  }
  return versions;
}

export interface ServerPlan {
  /** The benchmarks this server will handle. */
  specs: BenchmarkSpec[];
  /** NPM installations needed for this server. */
  npmInstalls: NpmInstall[];
  /** URL to disk path mappings. */
  mountPoints: MountPoint[];
}

export interface NpmInstall {
  installDir: string;
  packageJson: NpmPackageJson;
}

export async function makeServerPlans(
    benchmarkRoot: string, npmInstallRoot: string, specs: BenchmarkSpec[]):
    Promise<ServerPlan[]> {
  const keySpecs = new Map<string, BenchmarkSpec[]>();
  const keyDeps = new Map<string, PackageDependencyMap>();
  const defaultSpecs = [];
  for (const spec of specs) {
    if (spec.url.kind === 'remote') {
      // No server needed for remote URLs.
      continue;
    }
    if (spec.url.version.label === 'default') {
      defaultSpecs.push(spec);
      continue;
    }

    const diskPath = path.join(benchmarkRoot, spec.url.urlPath);  // TODO
    const kind = await fileKind(diskPath);
    if (kind === undefined) {
      throw new Error(`No such file or directory ${diskPath}`);
    }
    const originalPackageJsonPath = await findPackageJsonPath(
        kind === 'file' ? path.dirname(diskPath) : diskPath);
    if (originalPackageJsonPath === undefined) {
      throw new Error(`Could not find a package.json for ${diskPath}`);
    }
    const originalPackageJson = await fsExtra.readJson(originalPackageJsonPath);

    // TODO Key should use the actual dependencies instead of the label.
    const key = JSON.stringify([
      path.dirname(originalPackageJsonPath),
      spec.url.urlPath,
      spec.url.version.label,
    ]);
    let arr = keySpecs.get(key);
    if (arr === undefined) {
      arr = [];
      keySpecs.set(key, arr);
    }
    arr.push(spec);

    const newDeps = {
      ...originalPackageJson.dependencies,
      ...spec.url.version.dependencyOverrides,
    };
    keyDeps.set(key, newDeps);
  }

  const plans = [];

  if (defaultSpecs.length > 0) {
    plans.push({
      specs: defaultSpecs,
      npmInstalls: [],
      mountPoints: [
        {
          urlPath: `/`,
          diskPath: benchmarkRoot,
        },
      ],
    });
  }

  for (const [key, specs] of keySpecs.entries()) {
    const [packageDir, , label] = JSON.parse(key);
    const dependencies = keyDeps.get(key);
    if (dependencies === undefined) {
      throw new Error(`Internal error: no deps for key ${key}`);
    }

    const installDir =
        path.join(npmInstallRoot, hashStrings(packageDir, label));
    plans.push({
      specs,
      npmInstalls: [{
        installDir,
        packageJson: {
          private: true,
          dependencies,
        }
      }],
      mountPoints: [
        {
          urlPath: `/${path.relative(benchmarkRoot, packageDir)}/node_modules`,
          diskPath: path.join(installDir, 'node_modules'),
        },
        {
          urlPath: `/`,
          diskPath: benchmarkRoot,
        },
      ],
    });
  }

  return plans;
}

export async function fileKind(path: string): Promise<'file'|'dir'|undefined> {
  try {
    const stat = await fsExtra.stat(path);
    if (stat.isDirectory()) {
      return 'dir';
    }
    if (stat.isFile()) {
      return 'file';
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }
}

async function findPackageJsonPath(startDir: string):
    Promise<string|undefined> {
  let cur = path.resolve(startDir);
  while (true) {
    const possibleLocation = path.join(cur, 'package.json');
    if (await fsExtra.pathExists(possibleLocation)) {
      return possibleLocation;
    }
    const parentDir = path.resolve(cur, '..');
    if (parentDir === cur) {
      return undefined;
    }
    cur = parentDir;
  }
}

export function hashStrings(...strings: string[]) {
  return crypto.createHash('sha256')
      .update(JSON.stringify(strings))
      .digest('hex');
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
 * Write the given package.json to the given directory and run "npm install"
 * in it. Do nothing if the directory already exists.
 */
export async function prepareVersionDirectory(
    {installDir, packageJson}: NpmInstall): Promise<void> {
  if (await fsExtra.pathExists(installDir)) {
    // TODO(aomarks) If the user specified new dependencies for the same
    // version label, it probably makes sense to delete the version directory
    // and install it again. We could read the package.json and check if the
    // versions differ.
    return;
  }
  console.log(`\nInstalling ${installDir} ...`);
  await fsExtra.ensureDir(installDir);
  await fsExtra.writeJson(
      path.join(installDir, 'package.json'), packageJson, {spaces: 2});
  await npmInstall(installDir);
}
