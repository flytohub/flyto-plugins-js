// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Auto-initializing bridge — import this to automatically create and
 * expose the bridge as `window.flyto`.
 *
 * Usage in HTML:
 *   <script type="module" src="/@flyto2/bridge/auto"></script>
 *   <script>
 *     flyto.submit({ cropped: true });
 *   </script>
 *
 * Or import in JS:
 *   import '@flyto2/plugin-ui-bridge/auto';
 *   window.flyto.submit({ result: 'done' });
 */

import { createBridge } from './bridge.js';

const bridge = createBridge();
window.flyto = bridge;
