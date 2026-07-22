# Flyto2 Plugins JS

[![npm: plugin-sdk](https://img.shields.io/npm/v/@flyto2/plugin-sdk?label=%40flyto2%2Fplugin-sdk)](https://www.npmjs.com/package/@flyto2/plugin-sdk)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Website](https://img.shields.io/badge/website-flyto2.com-8B5CF6)](https://flyto2.com)
[![Docs](https://img.shields.io/badge/docs-docs.flyto2.com-06B6D4)](https://docs.flyto2.com)

Interactive plugin SDK for Flyto2 workflows. Plugins run as Node.js processes,
communicate with Flyto2 Core over JSON-RPC, and can serve inline UI for forms,
tools, approvals, image editing, Slack actions, and human-in-the-loop workflow
steps.

Use this when a workflow needs a real interface, not just another headless
function call. A plugin can ask a person for approval, show a form, crop an
image, send a Slack message, or bridge a deterministic backend step into a small
browser UI.

Use it to build JavaScript and TypeScript automation plugins for Flyto2 Core,
Flyto2 Cloud, self-hosted workflows, MCP-adjacent tools, and workflow UIs that
need a clean bridge between deterministic backend steps and interactive browser
surfaces.

Good fit if you searched for:

- JavaScript plugin SDK for workflow automation
- TypeScript automation plugins with UI
- human-in-the-loop workflow plugin
- JSON-RPC plugin runtime for AI automation

Official links: [flyto2.com](https://flyto2.com) ·
[Docs](https://docs.flyto2.com) ·
[npm package](https://www.npmjs.com/package/@flyto2/plugin-sdk) ·
[Flyto2 Core repository](https://github.com/flytohub/flyto-core)

## Architecture

```
Flyto2 Core (Python) ←── JSON-RPC stdin/stdout ──→ Plugin (Node.js)
                                                      │
                                                      ├── Headless steps (like Slack send_message)
                                                      └── UI steps (serve HTML via local HTTP server)
                                                            │
                                                            └── iframe in Flyto2 Cloud
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
npm ci
npm run verify
```

For a consumer project, install only the SDK:

```bash
npm install @flyto2/plugin-sdk
```

Node.js 20 or newer is required. The SDK has no hosted control-plane
dependency: Flyto2 Core launches the built plugin process and exchanges one
JSON-RPC object per line over stdin/stdout.

## Testing

```bash
# Compile every workspace
npm run build

# Run 57 Node tests and 17 Python process scenarios
npm test

# Check source/manifest/package parity and generated references
npm run contracts
npm run docs

# Pack all six public workspaces and smoke-test installed tarballs
npm run pack:check
```

## Configuration

Local build, lint, packaging, and tests require no environment variables. The
Slack reference plugin resolves `SLACK_BOT_TOKEN` from the Flyto2 Core secret
context first and the process environment second. Use `.env.example` only as a
name reference; do not commit credentials or pass them to UI props.

## Usage

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

Duplicate or malformed step IDs are rejected. UI directories must be relative
to a plugin root, and handler input and browser submissions must be treated as
untrusted data.

## API Reference

- [Generated source API](docs/generated/source-api.md) maps all 111 named
  production declaration to source and its contract.
- [SDK API](docs/SDK_API.md) explains process, handler, server, bridge, and token
  behavior.
- [Generated plugin contracts](docs/generated/plugin-contracts.md) derives all
  five step schemas from the three `plugin.yaml` files.
- [Form field contract](docs/FORM_FIELDS.md) covers every dynamic field type,
  validation rule, condition, and file limit.
- [Generated UI token reference](docs/generated/ui-tokens.md) lists all 78 CSS
  custom properties and eight utility classes.
- [plugin.yaml specification](PLUGIN_SPEC.md) defines discovery metadata.

Generated references are freshness checked by `npm run docs`; edit their source
or manifest and run `npm run docs:generate` instead of editing generated files.

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
├── scripts/           Contract, docs, and package-content gates
├── tests/             Python process interoperability tests
├── docs/generated/    Source-derived API and manifest references
└── PLUGIN_SPEC.md     plugin.yaml specification
```

The root `npm run verify` command starts from a clean tree, compiles and lints
all six workspaces, runs unit and process tests, validates package/manifest
parity, checks generated documentation freshness, installs packed SDK assets in
a temporary consumer, and runs strict Flyto2 Indexer analysis.

## Security

The interactive server binds only to `127.0.0.1`, confines files by resolved
real path, uses random request IDs as callback capabilities, caps JSON callback
bodies at 10 MiB, and allows callback CORS only from its exact loopback origin.
Never place credentials in UI props or logs. Core remains responsible for
process isolation, authorization, tenant boundaries, and secret resolution.

Read [the UI security boundary](docs/UI_RUNTIME.md) and
[SECURITY.md](SECURITY.md). Report vulnerabilities privately to
`security@flyto2.com`.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), project state, architecture, and
decisions before changing protocol or manifest contracts. A change to a
reference plugin must keep its package version, manifest identity, TypeScript
registration, generated contract, tests, and tarball content aligned.

## Publishing

Six public packages publish to npmjs.com from signed `v*` tags using GitHub OIDC
trusted publishing and npm provenance. No npm automation token is required.
See [the release runbook](docs/RELEASE.md) for one-time publisher setup, version
parity, tag rules, rollback boundaries, and the historical `v0.1.1` constraint.

## License

Apache-2.0
