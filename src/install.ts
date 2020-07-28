/**
 * @license
 * Copyright (c) 2020 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

import {promises as fs} from 'fs';
import path from 'path';
import {install} from 'pkg-install';
import pkgUp from 'pkg-up';

export type OnDemandDependencies = Map<string, string>;

export interface ContainsOnDemandDependencies {
  [index: string]: unknown;
  devDependencies?: {[index: string]: string};
  installsOnDemand?: string[];
}

export const getPackageJSONPath = async(): Promise<string|null> => {
  return pkgUp({cwd: __dirname});
};

export const getPackageRoot = async(): Promise<string|null> => {
  const packageJSONPath = await getPackageJSONPath();
  return packageJSONPath != null ? path.dirname(packageJSONPath) : null;
};

/**
 * Extract a map of allowed "on-demand" dependencies from a given
 * package.json-shaped object.
 */
export const onDemandDependenciesFromPackageJSON =
    (packageJSON: ContainsOnDemandDependencies): OnDemandDependencies => {
      const onDemandDependencies = new Map<string, string>();

      const devDependencies = packageJSON?.devDependencies || {};
      const onDemandList: string[] = packageJSON?.installsOnDemand || [];

      for (const packageName of onDemandList) {
        if (packageName in devDependencies) {
          onDemandDependencies.set(packageName, devDependencies[packageName]);
        }
      }

      return onDemandDependencies;
    };

/**
 * So-called "on-demand" dependencies are any packages that match both of the
 * following requirements:
 *
 *  - They are listed in package.json as "devDependencies"
 *  - They are enumerated in the non-normative package.json field
 *    "installsOnDemand"
 *
 * This function resolves a map of package names and semver ranges including all
 * packages that match these requirements.
 */
export const getOnDemandDependencies = (() => {
  let cached: OnDemandDependencies|null = null;
  return async(): Promise<OnDemandDependencies> => {
    if (cached == null) {
      try {
        const packageJSONPath = await getPackageJSONPath();

        if (packageJSONPath != null) {
          const rawPackageJSON = await fs.readFile(packageJSONPath);
          const packageJSON = JSON.parse(rawPackageJSON.toString('utf-8')) as
              ContainsOnDemandDependencies;

          cached = onDemandDependenciesFromPackageJSON(packageJSON);
        }
      } catch (_error) {
        cached = new Map();
      }
    }

    return cached!;
  };
})();

/**
 * Install an "on-demand" package, resolving after the package has been
 * installed. Only packages designated as installable on-demand can be
 * installed this way (see documentation for "getOnDemandDependenies" for more
 * details). An attempt to install any other package this way will be rejected.
 *
 * On-demand packages are installed to this package's node_modules directory.
 * Any package that can already be resolved from this package's root directory
 * will be skipped.
 */
export const installOnDemand = async (packageName: string) => {
  try {
    require.resolve(packageName);
    // Implies the package is already installed
    return;
  } catch (_error) {
  }

  const dependencies = await getOnDemandDependencies();

  if (!dependencies.has(packageName)) {
    throw new Error(`Package "${packageName}" cannot be installed on demand. ${
        dependencies}`);
  }

  const version = dependencies.get(packageName);

  await install(
      {[packageName]: version},
      {stdio: 'inherit', cwd: await getPackageRoot() || process.cwd()});

  console.log(`Package "${packageName}@${version} installed."`);
};
