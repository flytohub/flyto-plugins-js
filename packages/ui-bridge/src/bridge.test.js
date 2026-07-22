// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/** Browser-free contract tests for the iframe bridge. */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBridge, getBridge } from './bridge.js';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;

/** Install the minimum browser surface required by createBridge. */
function installBrowser(search = '', fetchImpl = originalFetch) {
  const messages = [];
  const styles = [];
  const listeners = new Map();
  const parent = {
    postMessage(message, origin) {
      messages.push({ message, origin });
    },
  };
  globalThis.window = {
    location: { search },
    parent,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  };
  globalThis.document = {
    documentElement: {
      style: {
        setProperty(key, value) {
          styles.push({ key, value });
        },
      },
    },
  };
  globalThis.fetch = fetchImpl;
  return { listeners, messages, parent, styles };
}

afterEach(() => {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.fetch = originalFetch;
});

describe('createBridge', () => {
  it('parses props and posts ready/submit to the exact parent origin', () => {
    const props = encodeURIComponent(JSON.stringify({ value: '100% ready' }));
    const browser = installBrowser(`?__flyto_req=req-1&__flyto_props=${props}`);
    const bridge = createBridge({ origin: 'https://cloud.flyto2.com/path' });

    assert.deepEqual(bridge.props, { value: '100% ready' });
    assert.equal(browser.messages[0].origin, 'https://cloud.flyto2.com');
    bridge.submit({ accepted: true });
    assert.equal(browser.messages.length, 2);
    assert.match(browser.messages[1].message, /"type":"submit"/);
    assert.throws(() => bridge.submit(null), /must be an object/);
  });

  it('accepts updates only from the configured parent and filters theme keys', () => {
    const browser = installBrowser();
    const bridge = createBridge({ origin: 'https://cloud.flyto2.com' });
    const propUpdates = [];
    const themeUpdates = [];
    bridge.onProps((props) => propUpdates.push(props));
    bridge.onTheme((tokens) => themeUpdates.push(tokens));
    const onMessage = browser.listeners.get('message');

    onMessage({
      source: {},
      origin: 'https://cloud.flyto2.com',
      data: 'flyto-plugin:' + JSON.stringify({ type: 'props', data: { ignored: true } }),
    });
    onMessage({
      source: browser.parent,
      origin: 'https://attacker.example',
      data: 'flyto-plugin:' + JSON.stringify({ type: 'props', data: { ignored: true } }),
    });
    onMessage({
      source: browser.parent,
      origin: 'https://cloud.flyto2.com',
      data: 'flyto-plugin:' + JSON.stringify({ type: 'props', data: { accepted: true } }),
    });
    onMessage({
      source: browser.parent,
      origin: 'https://cloud.flyto2.com',
      data: 'flyto-plugin:' + JSON.stringify({
        type: 'theme',
        data: { '--flyto-primary': '#123456', color: 'red', '--flyto-bad': 4 },
      }),
    });

    assert.deepEqual(propUpdates, [{ accepted: true }]);
    assert.deepEqual(themeUpdates, [{ '--flyto-primary': '#123456' }]);
    assert.deepEqual(browser.styles, [{ key: '--flyto-primary', value: '#123456' }]);
  });

  it('falls back to parent messaging when a loopback callback fails', async () => {
    const browser = installBrowser(
      '?__flyto_port=8333&__flyto_req=req-2',
      async () => ({ ok: false, status: 404 }),
    );
    const bridge = createBridge({ origin: 'https://cloud.flyto2.com' });
    bridge.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(browser.messages.some(({ message }) => message.includes('"type":"cancel"')));
  });

  it('rejects non-http parent origins', () => {
    installBrowser();
    assert.throws(() => createBridge({ origin: 'javascript:alert(1)' }), /http or https/);
  });
});

describe('getBridge', () => {
  it('returns one lazy singleton', () => {
    installBrowser();
    assert.equal(getBridge(), getBridge());
  });
});
