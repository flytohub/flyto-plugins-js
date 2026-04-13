# flyto-plugins-js

Interactive plugin system for Flyto2 workflows. Plugins run as Node.js processes, communicate with flyto-core via JSON-RPC, and can serve interactive UIs (forms, tools, approvals) that appear inline during workflow execution.

## Architecture

```
flyto-core (Python) ←── JSON-RPC stdin/stdout ──→ Plugin (Node.js)
                                                      │
                                                      ├── Headless steps (like Slack send_message)
                                                      └── UI steps (serve HTML via local HTTP server)
                                                            │
                                                            └── iframe in flyto-cloud frontend
```

## Packages

| Package | Description |
|---------|-------------|
| [`@flyto/plugin-sdk`](packages/sdk/) | Core SDK — JSON-RPC runtime, UI server, step registration |
| [`@flyto/plugin-ui-tokens`](packages/ui-tokens/) | CSS design tokens matching flyto-cloud's look & feel |
| [`@flyto/plugin-ui-bridge`](packages/ui-bridge/) | Communication bridge for plugin UI iframes |

## Plugins

| Plugin | Type | Description |
|--------|------|-------------|
| [`@flyto/plugin-slack`](plugins/slack/) | Headless | Send messages, list channels |
| [`@flyto/plugin-form-builder`](plugins/form-builder/) | Interactive | Dynamic forms, wizard, approval |
| [`@flyto/plugin-image-crop`](plugins/image-crop/) | Interactive | Image cropping tool |

## Quick Start

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test
```

### Create a Plugin

```typescript
import { createPlugin } from '@flyto/plugin-sdk';

const plugin = createPlugin({ id: 'my-org/my-plugin', version: '1.0.0' });

// Headless step
plugin.step('do_something', async (input, ctx) => {
  return { ok: true, data: { result: input.value * 2 } };
});

// UI step (opens interactive page)
plugin.uiStep('configure', { page: 'ui', type: 'dialog', width: 600, height: 400 },
  async (input, ctx) => {
    const result = await ctx.waitForUI({ page: 'ui', props: { ...input } });
    return { ok: true, data: result.data };
  }
);

plugin.start();
```

See [PLUGIN_SPEC.md](PLUGIN_SPEC.md) for the full `plugin.yaml` specification.

## Development

```
flyto-plugins-js/
├── packages/
│   ├── sdk/           @flyto/plugin-sdk
│   ├── ui-tokens/     @flyto/plugin-ui-tokens
│   └── ui-bridge/     @flyto/plugin-ui-bridge
├── plugins/
│   ├── slack/         @flyto/plugin-slack
│   ├── form-builder/  @flyto/plugin-form-builder
│   └── image-crop/    @flyto/plugin-image-crop
├── tests/             E2E integration tests
└── PLUGIN_SPEC.md     plugin.yaml specification
```

## License

Apache-2.0
