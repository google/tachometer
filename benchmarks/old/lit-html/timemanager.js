const renderTimes = {};
window.renderTimes = renderTimes;

function round(t, place = 2) {
  const m = 10 ** place;
  return Math.round(t * m) / m;
}

export function updateTime(container, curSystem, newTime) {
  newTime = round(newTime);
  if (!renderTimes[curSystem]) {
    renderTimes[curSystem] = []
  }
  renderTimes[curSystem].push(newTime);

  let content = '';

  for (let system in renderTimes) {
    const systemRenderTimes = renderTimes[system];

    content += '<div>';
    content += `System: ${system}<br />`;
    content += '</div>';

    systemRenderTimes.sort((a, b) => a - b);
    let marked = false;
    const times = systemRenderTimes.map((t) => {
      let formattedTime = t;
      if (t == newTime && !marked) {
        formattedTime = `<strong>${t}</strong>`;
        marked = true;
      }
      return formattedTime;
    });
    const average = round(
        systemRenderTimes.reduce((a, b) => a + b, 0) /
        systemRenderTimes.length);

    const midPoint = (systemRenderTimes.length / 2) | 0;
    const median = systemRenderTimes[midPoint];

    content += `
        <div>${times.join(', ')}</div>
        <div>Mean: ${average}</div>
        <div>Median: ${median}</div>
    `;
  }

  container.innerHTML = content;

  window.parent.postMessage(renderTimes[curSystem], '*');
}
