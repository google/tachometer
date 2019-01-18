import {updateTime} from './timemanager.js';

const coldFrame = document.querySelector('#cold');
const recurseSrc = './recurse.html';

coldFrame.src = recurseSrc;

function setSystem(sys) {
  coldFrame.contentWindow.setSystem(sys);
}

function iframeAfterPaint() {
  return new Promise((r) => {
    coldFrame.contentWindow.requestAnimationFrame(() => {
      setTimeout(r, 0);
    });
  });
}

function waitPostMessage() {
  return new Promise((r) => {
    const onMessage = (event) => {
      r(event.data);
      window.removeEventListener('message', onMessage);
    };
    window.addEventListener('message', onMessage);
  });
}

function bench(sys) {
  return new Promise((r) => {
           coldFrame.onload = r;
           coldFrame.src = recurseSrc;
         })
      .then(() => {
        setSystem(sys);

        coldFrame.contentWindow.bench();
        return waitPostMessage();
      })
      .then(() => {
        const renderTimes = coldFrame.contentWindow.renderTimes[sys];
        updateTime(document.querySelector('#results'), sys, renderTimes[0]);
      });
}

async function runBench(sys, n) {
  while (n--) {
    await bench(sys);
  }
}
window.runBench = runBench;

const form = document.querySelector('form');

form.addEventListener('submit', (e) => e.preventDefault());

document.querySelector('button#bench').addEventListener('click', () => {
  const numRuns = parseInt(document.querySelector('#num-times').value, 0);
  const sys = form.system.value;
  runBench(sys, numRuns);
});
