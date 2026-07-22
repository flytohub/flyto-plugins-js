# Changelog

## Unreleased

### Added

- Added project memory files, workflow docs, and handoff registry.
- Added complete SDK, UI runtime, manifest, and five-step reference-plugin
  documentation with machine-readable feature ownership and CI enforcement.
- Added source-derived references for 111 declarations, five plugin steps, 78
  UI tokens, and eight utility classes.
- Added manifest/package/registration contract checks and real npm tarball
  installation smoke tests for all six public workspaces.
- Added direct unit tests for UI Bridge, UI Tokens, and every reference plugin
  handler, plus Python process interoperability in the root test command.

### Changed

- Made workspace build, lint, test, documentation, contract, tarball, and strict
  index validation part of one clean `npm run verify` gate.
- Public package metadata now targets npmjs.com with public access and includes
  package-level README and Apache-2.0 license files.
- npm publishing now uses GitHub OIDC trusted publishing and provenance rather
  than a long-lived npm token.
- Reference handlers validate required inputs, output shapes, supported image
  formats and URL schemes, quality ranges, approval decisions, and Slack limits.
- Form definitions now validate all 22 interactive/structural field types,
  unique safe IDs, choice options, conditions, and regular-expression syntax;
  crop results validate exact MIME, finite geometry, and positive dimensions.

### Security

- Hardened inline UI props serialization, static-file root checks, and iframe
  message source/origin validation.
- Confined UI files by real path, removed wildcard callback CORS, limited JSON
  bodies by bytes, validated callback capabilities/content, and added cache,
  referrer, content-type, and resource-policy response headers.
- Brought the SDK's auto-injected compatibility bridge in line with the package
  bridge for submit types, theme-token filtering, parent source checks, and
  non-2xx callback fallback.
- Reject malformed JSON-RPC envelopes, invalid runtime/step IDs, duplicate step
  registrations, unsafe UI paths, invalid timeouts, and invalid invocation
  contexts before execution.
- Validate semantic versions, callable handlers, input/context/result shapes,
  string-valued secrets, UI modes/dimensions/props, and portable path traversal;
  register callback capabilities before `ui.open` and always emit `ui.close`.
