import { html, render } from '../lit-html.js';
import { init } from './init.js';

function renderBox(title, id, content) {
  return html`<div><span>${title}</span><span id="text">${content}</span></div>`;
}

function renderSimpleText(string) {
  return renderBox('Simple Text: ', 'text', string);
}

function renderXChild(data, string, depth = 0) {
  if (data) {
    return html`<div>${
      renderSimpleText(string)}${
      renderBox(
        'Data Text: ',
        'data-text',
        data ? data.text : undefined)}${
          renderBox('depth: ', 'depth', depth)}${
            renderXChild(data && data.xChild ? data.xChild : undefined,
              string,
              depth + 1)}</div>`;
  }
}

function draw(container, data, string, depth = 0) {
  render(renderXChild(data, string, depth), container);
  console.log(window.insertBeforeCount);
  console.log(window.insertBeforePrepCount);
  console.log(window.insertBeforeRenderCount);
}

init('lit', draw);
