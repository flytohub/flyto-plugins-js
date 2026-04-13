# @flyto/plugin-ui-bridge

Communication bridge between Flyto2 plugin UIs and the host app. Handles bidirectional messaging, theme sync, and result submission.

## Usage

### Auto-injected (recommended)

When using `@flyto/plugin-sdk` with a UI step, the bridge is automatically injected as `window.flyto`:

```html
<button onclick="flyto.submit({ result: 'done' })">Submit</button>
<button onclick="flyto.cancel()">Cancel</button>
```

### Manual Import

```javascript
import { createBridge } from '@flyto/plugin-ui-bridge';

const bridge = createBridge();

// Access props from the workflow step
console.log(bridge.props); // { imageUrl: '...', aspectRatio: '16:9' }

// Submit result back to the workflow
bridge.submit({ croppedUrl: 'data:image/png;base64,...' });

// Cancel (workflow continues with cancelled state)
bridge.cancel();

// Listen for prop updates
bridge.onProps((props) => {
  console.log('Props updated:', props);
});

// Listen for theme changes
bridge.onTheme((tokens) => {
  console.log('Theme tokens:', tokens);
});
```

## API

### `createBridge(options?)`

Create a new bridge instance.

- `options.origin` — Allowed parent origin for postMessage (default: auto-detect)

### `bridge.props`

Read-only. Current props passed from the workflow step input.

### `bridge.submit(data)`

Submit a result and close the UI. The workflow continues with this data.

### `bridge.cancel()`

Cancel without submitting. The workflow receives a cancellation result.

### `bridge.onProps(handler)`

Register a callback for prop updates from the host.

### `bridge.onTheme(handler)`

Register a callback for theme token updates.

## Communication Channels

The bridge uses two channels (auto-selected):

1. **HTTP POST** — Plugin SDK's local HTTP server (development)
2. **postMessage** — iframe ↔ host window (production)
