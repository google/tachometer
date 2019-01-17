import { init } from './init.js';

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
  if (data) {
    return h('div', [
          renderSimpleText(string),
          renderBox(
              'Data Text: ',
              'data-text',
              data ? data.text : undefined),
          renderBox('depth: ', 'depth', depth),
          renderXChild(data && data.xChild ? data.xChild : undefined, string, depth + 1),
        ]);
  }
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

init('snabbdom', draw);
