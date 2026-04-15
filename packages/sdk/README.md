# @flyto2/plugin-sdk

SDK for building Flyto2 plugins in TypeScript/JavaScript.

## Usage

```typescript
import { createPlugin } from '@flyto2/plugin-sdk';

const plugin = createPlugin({ id: 'my-org/my-plugin', version: '1.0.0' });

// Register a headless step
plugin.step('echo', async (input, ctx) => {
  return { ok: true, data: { message: input.text } };
});

// Register a UI step (opens interactive page during workflow execution)
plugin.uiStep('configure',
  { page: 'ui', type: 'dialog', width: 800, height: 600 },
  async (input, ctx) => {
    const result = await ctx.waitForUI({
      page: 'ui',
      props: { initialValue: input.value },
    });
    if (!result.submitted) {
      return { ok: false, error: { code: 'CANCELLED', message: 'User cancelled' } };
    }
    return { ok: true, data: result.data };
  }
);

plugin.start(); // Listen on stdin for JSON-RPC messages
```

## API

### `createPlugin(config)`

Create a new plugin instance.

- `config.id` — Plugin runtime ID (`vendor/name` format)
- `config.version` — SemVer version string
- `config.name` — Optional display name

### `plugin.step(stepId, handler)`

Register a headless step handler.

### `plugin.uiStep(stepId, uiConfig, handler)`

Register a UI-enabled step. `uiConfig`:

- `page` — Path to the UI directory (must contain `index.html`)
- `type` — `"page"` | `"panel"` | `"dialog"`
- `width` / `height` — Default dimensions in pixels

### `plugin.start()`

Begin listening for JSON-RPC messages on stdin.

## Protocol

Communicates with flyto-core via JSON-RPC 2.0 over stdin/stdout:

- `handshake` — Negotiate protocol version, report available steps
- `invoke` — Execute a step with input and context
- `ping` — Health check
- `shutdown` — Graceful shutdown
