# 2026-07-22 Contract Audit

## Completed

- Mapped every named production SDK, bridge, token, plugin-handler, and embedded
  UI declaration into a generated source reference.
- Generated plugin schema and token references directly from YAML and CSS.
- Added strict package/manifest/source parity, package-content, installed
  consumer, test, documentation, and Indexer gates.
- Hardened JSON-RPC validation, UI server confinement and callbacks, browser
  message origin handling, token injection, and reference handler input/output.
- Replaced npm token publication with OIDC trusted publishing and provenance.

## External Follow-Up

- Configure trusted publishing on all six npm package pages.
- Use `0.1.2` or newer for the next release because historical tag `v0.1.1`
  already exists while npm packages remain at `0.1.0`.
- Complete custom-control and cropper keyboard accessibility work tracked in
  `tasks.md` before claiming full WCAG coverage.

## Verification

Completed locally on 2026-07-22:

- `npm run verify`: pass; 57 Node tests, 17 Python process scenarios, six
  package tarballs, installed-consumer smoke, and Indexer 17/17.
- `flyto-index docs . --json`: README/overall/API/module/inline all 100 with no
  suggestions.
- documentation manifest strict audit: four source areas, nine features, zero
  errors and zero warnings.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities.
- Flyto2 Indexer license scan: Apache-2.0, no missing dependency licenses, no
  copyleft warning.

For future changes, run `npm ci && npm run verify`; generated references and
packed artifact checks are intentionally blocking.
