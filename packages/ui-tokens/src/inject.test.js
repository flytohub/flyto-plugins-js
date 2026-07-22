// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/** Browser-free contract tests for runtime token helpers. */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { injectTokens, readTokens } from './inject.js';

const originalDocument = globalThis.document;
const originalGetComputedStyle = globalThis.getComputedStyle;

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.getComputedStyle = originalGetComputedStyle;
});

describe('injectTokens', () => {
  it('sets only string Flyto2 custom properties', () => {
    const applied = [];
    const target = { style: { setProperty: (key, value) => applied.push([key, value]) } };
    injectTokens({ '--flyto-primary': '#123456', color: 'red', '--flyto-count': 2 }, target);
    assert.deepEqual(applied, [['--flyto-primary', '#123456']]);
    assert.throws(() => injectTokens(null, target), /must be an object/);
  });
});

describe('readTokens', () => {
  it('reads Flyto2 variables and skips inaccessible stylesheets', () => {
    const rule = {
      selectorText: ':root',
      style: Object.assign(['--flyto-primary', 'color'], { length: 2 }),
    };
    const blocked = {};
    Object.defineProperty(blocked, 'cssRules', { get() { throw new Error('cross origin'); } });
    globalThis.document = {
      documentElement: {},
      styleSheets: [{ cssRules: [rule] }, blocked],
    };
    globalThis.getComputedStyle = () => ({
      getPropertyValue: (name) => name === '--flyto-primary' ? ' #123456 ' : '',
    });

    assert.deepEqual(readTokens(), { '--flyto-primary': '#123456' });
  });
});
