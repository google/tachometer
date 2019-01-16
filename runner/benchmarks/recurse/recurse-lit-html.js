/**
 * @license
 * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

import { html, render } from '../../../lit-html.js';
import {benchmark} from '../../client/lib/index.js';

console.log('recurse benchmark');

const run = (depth = 500) => {
  const data = genXChildData(depth);
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new Promise((resolve, _reject) => {
    requestAnimationFrame(() => {
      const start = performance.now();
      draw(container, data, 'hello');
      setTimeout(() => {
        const end = performance.now();
        const result = end - start;
        document.body.removeChild(container);
        resolve(result);
      }, 0);
    });
  });
}

benchmark('recurse', run);

const renderBox = (title, id, content) => html`
  <div>
    <span>${title}</span>
    <span id=${id}>${content}</span>
  </div>`;

const renderSimpleText = (string) => renderBox('Simple Text: ', 'text', string);

const renderXChild = (data, string, depth = 0) => {
  if (data) {
    return html`
        <div>
          ${renderSimpleText(string)}
          ${renderBox(
              'Data Text: ',
              'data-text',
              data ? data.text : undefined)}
          ${renderBox('depth: ', 'depth', depth.toString())}
          ${renderXChild(data && data.xChild ? data.xChild : undefined,
              string,
              depth + 1)}
        </div>
    `;
  }
  return;
};

const draw = (container, data, string, depth = 0) => 
    render(renderXChild(data, string, depth), container);

const genXChildData = (depth) => {
  let xChild = {};
  while (depth--) {
    xChild = {xChild};
  }
  return xChild;
};
