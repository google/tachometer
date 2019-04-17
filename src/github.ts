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

import * as got from 'got';
import * as jsonwebtoken from 'jsonwebtoken';

/**
 * Configuration data needed to create a GitHub Check.
 *
 * GitHub Checks are attached to a particular commit in a particular repo, and
 * are created by GitHub Apps, which are installed into an org or repo.
 *
 * More info at https://developer.github.com/v3/apps/
 *
 * Note that we do not currently manage a generally-accessible GitHub App. We
 * only support a fully self-service integration, whereby users are expected to
 * create their own GitHub App, install it to their repos, grant full power to
 * this binary to act as that App via a private key, and then piggyback on e.g.
 * Travis CI to actually run the benchmarks. This avoids the need to run any
 * services for the time being, but still lets us have our own standalone Check
 * tab in the GitHub UI.
 */
export interface CheckConfig {
  appId: number;
  installationId: number;
  repo: string;
  commit: string;
}

/**
 * Parse the --github-check flag.
 */
export function parseCheckFlag(flag: string): CheckConfig {
  const parsed = JSON.parse(flag) as Partial<CheckConfig>;
  if (!parsed.appId || !parsed.installationId || !parsed.repo ||
      !parsed.commit) {
    throw new Error(
        `Invalid --github-check flag. Must be a JSON object ` +
        `with properties: appId, installationId, repo, and commit.`);
  }
  return {
    appId: Number(parsed.appId),
    installationId: Number(parsed.installationId),
    repo: String(parsed.repo),
    commit: String(parsed.commit),
  };
}

/**
 * Create a JSON Web Token (https://tools.ietf.org/html/rfc7519), which allows
 * us to perform actions as a GitHub App.
 *
 * @param appId GitHub App ID. Can be found on the GitHub App settings page.
 * @param privateKey Text of a PEM private key. Can be generated from the GitHub
 *     App settings page. More info at
 *     https://developer.github.com/apps/building-github-apps/authenticating-with-github-apps/
 */
export function getAppToken(appId: number, privateKey: string): string {
  const expireMinutes = 10;
  const issuedTimestamp = Math.floor(Date.now() / 1000);
  const expireTimestamp = issuedTimestamp + expireMinutes * 60;
  const payload = {
    iss: appId,            // (iss)uer
    iat: issuedTimestamp,  // (i)ssued (at)
    exp: expireTimestamp,  // (exp)iration time
  };
  return jsonwebtoken.sign(payload, privateKey, {algorithm: 'RS256'});
}

/**
 * Create an access token which allows us to perform actions as a GitHub App
 * Installation.
 */
export async function getInstallationToken(
    {installationId, appToken}: {installationId: number, appToken: string}):
    Promise<string> {
  const resp = await got.post(
      `https://api.github.com/installations/${installationId}/access_tokens`, {
        headers: {
          Accept: 'application/vnd.github.machine-man-preview+json',
          Authorization: `Bearer ${appToken}`,
        },
      });
  const data = JSON.parse(resp.body) as {token: string};
  return data.token;
}

/**
 * Create a new GitHub Check Run (a single invocation of a Check on some commit)
 * and return its identifier.
 */
export async function createCheckRun(
    {repo, commit, installationToken}:
        {repo: string, commit: string, installationToken: string}):
    Promise<string> {
  const resp =
      await got.post(`https://api.github.com/repos/${repo}/check-runs`, {
        headers: {
          Accept: 'application/vnd.github.antiope-preview+json',
          Authorization: `Bearer ${installationToken}`,
        },
        // https://developer.github.com/v3/checks/runs/#parameters
        body: JSON.stringify({
          head_sha: commit,
          name: 'Tachometer Benchmarks',
        }),
      });
  const data = JSON.parse(resp.body) as {id: string};
  return data.id;
}

/**
 * Update a GitHub Check run with the given markdown text and mark it as
 * complete.
 */
export async function completeCheckRun(
    {repo, installationToken, checkId, markdown}: {
      repo: string,
      checkId: string,
      markdown: string,
      installationToken: string
    }) {
  await got.patch(
      `https://api.github.com/repos/${repo}/check-runs/${checkId}`, {
        headers: {
          Accept: 'application/vnd.github.antiope-preview+json',
          Authorization: `Bearer ${installationToken}`,
        },
        // https://developer.github.com/v3/checks/runs/#parameters-1
        body: JSON.stringify({
          name: 'Tachometer Benchmarks',
          completed_at: new Date().toISOString(),
          // Note that in the future we will likely want to be able to report
          // a failing check (e.g. if there appears to be a slowdown greater
          // than some threshold).
          conclusion: 'neutral',
          output: {
            title: 'Tachometer Benchmarks',
            summary: 'Benchmark results',
            text: markdown,
          }
        }),
      });
}
