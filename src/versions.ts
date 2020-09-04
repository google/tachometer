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

import * as childProcess from 'child_process';
import * as crypto from 'crypto';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as util from 'util';

const execFilePromise = util.promisify(childProcess.execFile);
const execPromise = util.promisify(childProcess.exec);

import {MountPoint} from './server';
import {BenchmarkSpec, GitDependency, NpmPackageJson, PackageDependencyMap, PackageVersion} from './types';
import {fileKind, runNpm, throwUnreachable} from './util';

interface GitDependencyWithTempDir extends GitDependency {
  tempDir: string;
}

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
    Promise<{plans: ServerPlan[], gitInstalls: GitDependencyWithTempDir[]}> {
  const keySpecs = new Map<string, BenchmarkSpec[]>();
  const keyDeps = new Map<string, PackageDependencyMap>();
  const defaultSpecs = [];
  const gitInstalls = new Map<string, GitDependencyWithTempDir>();
  for (const spec of specs) {
    if (spec.url.kind === 'remote') {
      // No server needed for remote URLs.
      continue;
    }
    if (spec.url.version === undefined) {
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
    };
    for (const pkg of Object.keys(spec.url.version.dependencyOverrides)) {
      const version = spec.url.version.dependencyOverrides[pkg];
      if (typeof version === 'string') {
        // NPM dependency syntax that can be handled directly by NPM without any
        // help from us. This includes NPM packages, file paths, git repos (but
        // not monorepos!), etc. (see
        // https://docs.npmjs.com/configuring-npm/package-json.html#dependencies)
        newDeps[pkg] = version;
      } else {
        switch (version.kind) {
          case 'git':
            // NPM doesn't support directly installing from a sub-directory of a
            // git repo, like in monorepos, so we handle those cases ourselves.
            const hash = hashStrings(
                pkg,
                version.kind,
                version.repo,
                version.ref,
                version.subdir || '',
                ...(version.setupCommands || []));
            const tempDir = path.join(npmInstallRoot, hash);
            const tempPackageDir =
                version.subdir ? path.join(tempDir, version.subdir) : tempDir;
            newDeps[pkg] = tempPackageDir;
            // We're using a Map here because we want to de-duplicate git
            // installations that have the exact same parameters, since they can
            // be re-used across multiple benchmarks.
            gitInstalls.set(hash, {...version, tempDir});
            break;
          default:
            throwUnreachable(
                version.kind,
                'Unknown dependency version kind: ' + version.kind);
        }
      }
    }
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
          urlPath: path.posix.join(
              '/',
              path.relative(benchmarkRoot, packageDir)
                  .replace(path.win32.sep, '/'),
              'node_modules'),
          diskPath: path.join(installDir, 'node_modules'),
        },
        {
          urlPath: `/`,
          diskPath: benchmarkRoot,
        },
      ],
    });
  }

  return {plans, gitInstalls: [...gitInstalls.values()]};
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

const tachometerVersion =
    require(path.join(__dirname, '..', 'package.json')).version;

/**
 * Write the given package.json to the given directory and run "npm install"
 * in it. If the directory already exists and its package.json is identical,
 * don't install, just log instead.
 */
export async function prepareVersionDirectory(
    {installDir, packageJson}: NpmInstall,
    forceCleanInstall: boolean): Promise<void> {
  const serializedPackageJson = JSON.stringify(
      {
        // Include our version here so that we automatically re-install any
        // existing package version install directories when tachometer updates.
        __tachometer_version: tachometerVersion,
        ...packageJson,
      },
      null,
      2);
  const packageJsonPath = path.join(installDir, 'package.json');

  if (await fsExtra.pathExists(installDir)) {
    if (forceCleanInstall === false) {
      const previousPackageJson =
          await fsExtra.readFile(packageJsonPath, 'utf8');
      // Note we're comparing the serialized JSON. Node JSON serialization is
      // deterministic where property order is based on property creation order.
      // That's good enough for our purposes, since we know this exact code also
      // wrote the previous version of this file.
      if (previousPackageJson.trimRight() ===
          serializedPackageJson.trimRight()) {
        console.log(
            `\nRe-using NPM install dir because ` +
            `its package.json did not change:\n  ${installDir}\n`);
        return;
      }
      console.log(
          `\nDeleting previous NPM install dir ` +
          `because its package.json changed:\n  ${installDir}`);
    }
    await fsExtra.emptyDir(installDir);
  }

  console.log(`\nRunning npm install:\n  ${installDir}\n`);
  await fsExtra.ensureDir(installDir);
  await fsExtra.writeFile(packageJsonPath, serializedPackageJson);
  await runNpm(['install'], {cwd: installDir});
}

export async function installGitDependency(
    gitInstall: GitDependencyWithTempDir,
    forceCleanInstall: boolean): Promise<void> {
  if (forceCleanInstall) {
    await fsExtra.remove(gitInstall.tempDir);
  } else if (await fsExtra.pathExists(gitInstall.tempDir)) {
    // TODO(aomarks) We can be smarter here: if the ref is a branch or tag, we
    // can check if it has changed upstream with a fetch, and then re-install.
    console.log(
        `\nRe-using git checkout: ${gitInstall.repo}#${gitInstall.ref}`);
    return;
  }

  console.log(`\nCloning git repo to temp dir:\n  ${gitInstall.repo}\n`);
  await execFilePromise('git', [
    'clone',
    '--single-branch',
    '--depth=1',
    gitInstall.repo,
    gitInstall.tempDir,
  ]);

  console.log(`\nFetching and checking out ref:\n  ${gitInstall.ref}\n`);
  const cwdOpts = {cwd: gitInstall.tempDir};
  await execFilePromise(
      'git',
      ['fetch', 'origin', '--depth=1', '--tags', gitInstall.ref],
      cwdOpts);
  await execFilePromise('git', ['checkout', gitInstall.ref], cwdOpts);

  for (const setupCommand of gitInstall.setupCommands || []) {
    console.log(`\nRunning setup command:\n  ${setupCommand}\n`);
    await execPromise(setupCommand, cwdOpts);
  }
}