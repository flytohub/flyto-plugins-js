// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * @flyto/plugin-ui-bridge
 *
 * Lightweight bridge that runs inside a plugin UI iframe.
 * Handles bidirectional communication with the host (flyto-cloud or SDK dev server).
 *
 * Two communication channels:
 * 1. postMessage — for iframe ↔ host window communication (production)
 * 2. HTTP POST — for SDK local dev server (development)
 *
 * The bridge auto-detects which channel to use based on the URL params
 * injected by the SDK's UI server.
 */

/**
 * @typedef {Object} FlytoUIBridge
 * @property {(data: Record<string, unknown>) => void} submit
 * @property {() => void} cancel
 * @property {(handler: (props: Record<string, unknown>) => void) => void} onProps
 * @property {(handler: (tokens: Record<string, string>) => void) => void} onTheme
 * @property {Record<string, unknown>} props
 */

const FLYTO_MSG_PREFIX = 'flyto-plugin:';

/**
 * Create and initialize the bridge.
 * @param {Object} [options]
 * @param {string} [options.origin] — allowed parent origin for postMessage
 * @returns {FlytoUIBridge}
 */
export function createBridge(options = {}) {
  const params = new URLSearchParams(window.location.search);
  const callbackPort = params.get('__flyto_port');
  const requestId = params.get('__flyto_req');
  const parentOrigin = options.origin || params.get('__flyto_origin') || '*';

  /** @type {Record<string, unknown>} */
  let currentProps = {};
  try {
    const raw = params.get('__flyto_props');
    if (raw) currentProps = JSON.parse(decodeURIComponent(raw));
  } catch { /* ignore */ }

  /** @type {Array<(props: Record<string, unknown>) => void>} */
  const propsHandlers = [];

  /** @type {Array<(tokens: Record<string, string>) => void>} */
  const themeHandlers = [];

  // Listen for messages from the host
  window.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    if (!event.data.startsWith(FLYTO_MSG_PREFIX)) return;

    try {
      const payload = JSON.parse(event.data.slice(FLYTO_MSG_PREFIX.length));

      if (payload.type === 'props') {
        currentProps = payload.data || {};
        propsHandlers.forEach((h) => h(currentProps));
      }

      if (payload.type === 'theme') {
        const tokens = payload.data || {};
        // Apply tokens to :root
        const root = document.documentElement;
        for (const [key, value] of Object.entries(tokens)) {
          root.style.setProperty(key, value);
        }
        themeHandlers.forEach((h) => h(tokens));
      }
    } catch { /* ignore malformed messages */ }
  });

  /**
   * Send a message to the host.
   * @param {'submit' | 'cancel' | 'resize' | 'ready'} type
   * @param {unknown} [data]
   */
  function sendToHost(type, data) {
    const message = JSON.stringify({ type, data, requestId });

    // Channel 1: HTTP callback (SDK dev server)
    if (callbackPort) {
      fetch(`http://127.0.0.1:${callbackPort}/__flyto_callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: message,
      }).catch(() => {
        // Fallback to postMessage if HTTP fails
        postToParent(type, data);
      });
      return;
    }

    // Channel 2: postMessage (production iframe)
    postToParent(type, data);
  }

  /**
   * @param {string} type
   * @param {unknown} [data]
   */
  function postToParent(type, data) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        FLYTO_MSG_PREFIX + JSON.stringify({ type, data, requestId }),
        parentOrigin
      );
    }
  }

  /** @type {FlytoUIBridge} */
  const bridge = {
    /** Current props from the host */
    get props() {
      return currentProps;
    },

    /**
     * Submit the result and close the UI.
     * @param {Record<string, unknown>} data — result data passed back to the workflow
     */
    submit(data) {
      sendToHost('submit', data);
    },

    /**
     * Cancel the UI without submitting a result.
     */
    cancel() {
      sendToHost('cancel', null);
    },

    /**
     * Register a handler for prop updates from the host.
     * @param {(props: Record<string, unknown>) => void} handler
     */
    onProps(handler) {
      propsHandlers.push(handler);
      // Fire immediately with current props
      if (Object.keys(currentProps).length > 0) {
        handler(currentProps);
      }
    },

    /**
     * Register a handler for theme token updates.
     * @param {(tokens: Record<string, string>) => void} handler
     */
    onTheme(handler) {
      themeHandlers.push(handler);
    },
  };

  // Notify host that UI is ready
  sendToHost('ready', { steps: [] });

  return bridge;
}

// Export singleton for simple usage
let _defaultBridge = null;

/**
 * Get or create the default bridge instance.
 * @returns {FlytoUIBridge}
 */
export function getBridge() {
  if (!_defaultBridge) {
    _defaultBridge = createBridge();
  }
  return _defaultBridge;
}
