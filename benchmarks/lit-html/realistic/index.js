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

import * as bench from '../../../client/lib/index.js';
import {html, render} from '../node_modules/lit-html/lit-html.js';

const words = [
  'dolore',       'ipsum',      'amet',
  'pariatur',     'labore',     'culpa',
  'minim',        'anim',       'reprehenderit',
  'quis',         'incididunt', 'laboris',
  'eiusmod',      'esse',       'sint',
  'sunt',         'sit',        'nisi',
  'et',           'nulla',      'officia',
  'aliqua',       'ea',         'elit',
  'exercitation', 'tempor',     'mollit',
  'velit',        'lorem',      'ullamco',
  'id',           'qui',        'occaecat',
  'excepteur',    'ad',         'do',
  'voluptate',    'fugiat',     'non',
  'irure',        'est',        'aliquip',
  'enim',         'nostrud',    'adipiscing',
  'consectetur',  'cillum',     'veniam',
  'laborum',      'duis',       'deserunt',
  'magna',        'consequat',  'aute',
  'ut',           'proident',   'eu',
  'sed',          'cupidatat',  'commodo',
  'dolor',        'in',         'ex'
];

let w = 0;
const word = () => words[w++ % words.length];

const data = {
  title: 'My Homepage',
  list: [],
  tree: {},
};

for (let i = 0; i < 100; i++) {
  data.list.push(word());
}

const buildTree = (depth) =>
    depth <= 1 ? [word(), word()] : [word(), buildTree(depth - 1), word()];
data.tree = buildTree(10);

const renderPage = () => render(body(data), document.body);

const body = (data) => html`
  <header>${header(data)}</header>
  <main>${main(data)}</main>
  <footer>${footer(data)}</footer>
`;

const header = (data) => html`
  <h2>Welcome to ${data.title}!</h2>
  <button>🍔</button>
`;

const main = (data) => html`
  <p><b>Lorem</b> ipsum dolor sit amet, consectetur adipiscing elit, sed do
  eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
  veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
  commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit
  esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat
  cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id
  est laborum.</p>

  <h2>A list</h2>
  <ol>
    ${data.list.map((text) => html`<li><i>${text}</i></li>`)}
  </ol>

  <h2>A tree</h2>
  <ul>
    ${renderTree(data.tree)}
  </ul>`;

const footer = (data) => html`
  <p><b>Lorem</b> ipsum dolor sit amet, consectetur adipiscing elit, sed do
  eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
  veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
  commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit
  esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat
  cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id
  est laborum.</p>
`;

const renderTree = (nodes) => html`
  <ul>${
    nodes.map(
        (node) => html`<li>${
            node instanceof Array ? renderTree(node) :
                                    html`<b>${node}</b>`}</li>`)}
  </ul>`;

setTimeout(() => {
  bench.start();
  renderPage();
  bench.stop();
}, 100);
