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

The runtime ID must use `vendor/name`, versions must be semantic versions, and
step IDs use letters, numbers, underscores, dots, or hyphens. Duplicate
registrations and non-callable handlers throw instead of silently replacing or
deferring an invalid registration.

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
- `width` / `height` — Positive dimensions in pixels, no greater than 10,000
- `timeoutMs` — Positive wait limit in milliseconds; defaults to 300,000

### `plugin.start()`

Begin listening for JSON-RPC messages on stdin.

## Protocol

Communicates with Flyto2 Core via JSON-RPC 2.0 over stdin/stdout:

- `handshake` — Negotiate protocol version, report available steps
- `invoke` — Execute a step with input and context
- `ping` — Health check
- `shutdown` — Graceful shutdown

`UIServer` binds to loopback and treats the random callback request ID as a
single-use capability. Keep secrets in `StepContext.secrets`; never put them in
browser props. Invoke input/context and step results are runtime validated. See
the [full API](https://github.com/flytohub/flyto-plugins-js/blob/main/docs/SDK_API.md),
[generated source reference](https://github.com/flytohub/flyto-plugins-js/blob/main/docs/generated/source-api.md),
and [UI security boundary](https://github.com/flytohub/flyto-plugins-js/blob/main/docs/UI_RUNTIME.md).
