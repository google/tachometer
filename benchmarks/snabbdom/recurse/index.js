/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

import {registerBenchmark} from '../../../client/lib/index.js';

const genXChildData = (depth) => {
  let xChild = {};
  while (depth--) {
    xChild = {xChild};
  }
  return xChild;
};

const data = genXChildData(500);

const h = snabbdom.h;
const patch = snabbdom.init([]);

let vnode = null;

function renderBox(title, id, content) {
  return h('div', [
    h('span', title),
    h('span#text', content),
  ]);
}

function renderSimpleText(string) {
  return renderBox('Simple Text: ', 'text', string);
}

function renderXChild(data, string, depth = 0) {
  if (!data) {
    return;
  }
  return h('div', [
    renderSimpleText(string),
    renderBox('Data Text: ', 'data-text', data.text),
    renderBox('depth: ', 'depth', depth),
    renderXChild(data.xChild ? data.xChild : undefined, string, depth + 1),
  ]);
}

function draw(container, data, string, depth = 0) {
  let vnodeOrContainer = vnode;
  if (!vnodeOrContainer) {
    vnodeOrContainer = document.createElement('div');
    container.appendChild(vnodeOrContainer);
  }
  const newVnode = renderXChild(data, string, depth);
  patch(vnodeOrContainer, newVnode);
  vnode = newVnode;
}

registerBenchmark(() => {
  draw(document.body, data, 'hello');
});
