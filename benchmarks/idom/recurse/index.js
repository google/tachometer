import {init} from './init.js';

IncrementalDOM.attributes[IncrementalDOM.symbols['default']] = function(
    el, name, value) {
  const isProperty = name[name.length - 1] != '$';

  if (isProperty) {
    IncrementalDOM.applyProp(el, name, value);
  } else {
    IncrementalDOM.applyAttr(el, name.slice(0, -1), value);
  }
};

const idom = IncrementalDOM;
const open = idom.elementOpen, close = idom.elementClose, text = idom.text;


function renderBox(title, id, content) {
  open('div');
  open('span');
  text(title);
  close('span');
  open('span', null, ['id', 'text']);
  if (content !== undefined) {
    text(content);
  }
  close('span');
  close('div');
}

function renderSimpleText(string) {
  renderBox('Simple Text: ', 'text', string);
}

function renderXChild(data, string, depth = 0) {
  if (data) {
    open('div');
    renderSimpleText(string);
    renderBox('Data Text: ', 'data-text', data ? data.text : undefined);
    renderBox('depth: ', 'depth', depth);
    renderXChild(
        data && data.xChild ? data.xChild : undefined, string, depth + 1);
    close('div');
  }
}

function draw(container, data, string, depth = 0) {
  idom.patch(container, () => {renderXChild(data, string, depth)});
}

init('idom', draw);
