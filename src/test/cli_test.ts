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

import {assert} from 'chai';

import {parseHorizons} from '../cli';

suite('parseHorizons', function() {
  test('0ms', () => {
    assert.deepEqual(parseHorizons(['0ms']), {
      absolute: [0],
      relative: [],
    });
  });

  test('0.1ms', () => {
    assert.deepEqual(parseHorizons(['0.1ms']), {
      absolute: [-0.1, 0.1],
      relative: [],
    });
  });

  test('+0.1ms', () => {
    assert.deepEqual(parseHorizons(['+0.1ms']), {
      absolute: [0.1],
      relative: [],
    });
  });

  test('-0.1ms', () => {
    assert.deepEqual(parseHorizons(['-0.1ms']), {
      absolute: [-0.1],
      relative: [],
    });
  });

  test('0ms,0.1,1ms', () => {
    assert.deepEqual(parseHorizons(['0ms', '0.1ms', '1ms']), {
      absolute: [-1, -0.1, 0, 0.1, 1],
      relative: [],
    });
  });

  test('0%', () => {
    assert.deepEqual(parseHorizons(['0%']), {
      absolute: [],
      relative: [0],
    });
  });

  test('1%', () => {
    assert.deepEqual(parseHorizons(['1%']), {
      absolute: [],
      relative: [-0.01, 0.01],
    });
  });

  test('+1%', () => {
    assert.deepEqual(parseHorizons(['+1%']), {
      absolute: [],
      relative: [0.01],
    });
  });

  test('-1%', () => {
    assert.deepEqual(parseHorizons(['-1%']), {
      absolute: [],
      relative: [-0.01],
    });
  });

  test('0%,1%,10%', () => {
    assert.deepEqual(parseHorizons(['0%', '1%', '10%']), {
      absolute: [],
      relative: [-0.1, -0.01, 0, 0.01, 0.10],
    });
  });

  test('0ms,0.1ms,1ms,0%,1%,10%', () => {
    assert.deepEqual(
        parseHorizons(['0ms', '0.1ms', '1ms', '0%', '1%', '10%']), {
          absolute: [-1, -0.1, 0, 0.1, 1],
          relative: [-0.1, -0.01, 0, 0.01, 0.10],
        });
  });

  test('throws on nonsense', () => {
    assert.throws(() => parseHorizons(['sailboat']));
  });

  test('throws on ambiguous unit', () => {
    assert.throws(() => parseHorizons(['4']));
  });
});
