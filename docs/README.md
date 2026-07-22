# Documentation Index

- [Feature and ownership reference](FEATURES.md)
- [SDK classes, functions, and types](SDK_API.md)
- [Generated source API](generated/source-api.md)
- [UI server, bridge, tokens, and security boundary](UI_RUNTIME.md)
- [Reference plugin step contracts](PLUGINS.md)
- [Generated manifest contracts](generated/plugin-contracts.md)
- [Form field types and validation](FORM_FIELDS.md)
- [Generated UI token reference](generated/ui-tokens.md)
- [npm release runbook](RELEASE.md)
- [plugin.yaml specification](../PLUGIN_SPEC.md)
- [Architecture and protocol flow](../ARCHITECTURE.md)
- [Security policy](../SECURITY.md)
- [Current state](../STATE.md)

Package-specific quick starts remain beside their source under `packages/*`.
TypeScript/JavaScript/HTML source, `plugin.yaml`, and `tokens.css` are the
machine authorities. Run `npm run docs:generate` when those contracts move;
`npm run docs` rejects stale generated files.
