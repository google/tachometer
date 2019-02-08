import { updateTime } from './timemanager.js';

function genXChildData(depth) {
  let xChild = {};
  while (depth--) {
    xChild = {xChild: xChild};
  }
  return xChild;
}

const defaultJson = {
  string: 'hello',
  xChild: genXChildData(500),
};

const textArea = document.querySelector('#json');
const container = document.querySelector('#container');
const form = document.querySelector('form');

textArea.value = JSON.stringify(defaultJson);

const renderSystemMap = {};
let curSystem = 'lit';

export function setSystem(sys) {
  form.system.value = sys;
  curSystem = sys;
}
window.setSystem = setSystem;

export function init(label, fn) {
  renderSystemMap[label] = fn;

  const benchButton = document.querySelector('#bench');
  benchButton.addEventListener('click', bench);

  const clearButton = document.querySelector('#clear');
  clearButton.addEventListener('click', clear);

  document.querySelector('#radio-group').addEventListener('click', () => {
    curSystem = form.system.value;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
  });
}

function clear() {
  container.innerHTML = '';
}

function bench() {
  const json = JSON.parse(textArea.value);
  const drawFunction = renderSystemMap[curSystem];
  scheduleDraw(drawFunction.bind(window, container, json, json.string));
}
window['bench'] = bench;

function scheduleDraw(draw) {
  requestAnimationFrame(() => {
    console.time('recurse');
    let start = performance.now();
    draw();
    setTimeout(() => {
      let end = performance.now();
      console.timeEnd('recurse');
      const timing = document.querySelector('#timing');
      updateTime(timing, curSystem, end - start);
    }, 0);
  });
}
