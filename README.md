# flyto-plugins-js

[![npm: plugin-sdk](https://img.shields.io/npm/v/@flyto2/plugin-sdk?label=%40flyto%2Fplugin-sdk)](https://www.npmjs.com/package/@flyto2/plugin-sdk)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Website](https://img.shields.io/badge/website-flyto2.com-8B5CF6)](https://flyto2.com)
[![Docs](https://img.shields.io/badge/docs-docs.flyto2.com-06B6D4)](https://docs.flyto2.com)

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
| [`@flyto2/plugin-sdk`](packages/sdk/) | Core SDK — JSON-RPC runtime, UI server, step registration |
| [`@flyto2/plugin-ui-tokens`](packages/ui-tokens/) | CSS design tokens matching flyto-cloud's look & feel |
| [`@flyto2/plugin-ui-bridge`](packages/ui-bridge/) | Communication bridge for plugin UI iframes |

## Plugins

| Plugin | Type | Description |
|--------|------|-------------|
| [`@flyto2/plugin-slack`](plugins/slack/) | Headless | Send messages, list channels |
| [`@flyto2/plugin-form-builder`](plugins/form-builder/) | Interactive | Dynamic forms, wizard, approval |
| [`@flyto2/plugin-image-crop`](plugins/image-crop/) | Interactive | Image cropping tool |

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
import { createPlugin } from '@flyto2/plugin-sdk';

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
│   ├── sdk/           @flyto2/plugin-sdk
│   ├── ui-tokens/     @flyto2/plugin-ui-tokens
│   └── ui-bridge/     @flyto2/plugin-ui-bridge
├── plugins/
│   ├── slack/         @flyto2/plugin-slack
│   ├── form-builder/  @flyto2/plugin-form-builder
│   └── image-crop/    @flyto2/plugin-image-crop
├── tests/             E2E integration tests
└── PLUGIN_SPEC.md     plugin.yaml specification
```

## License

Apache-2.0
