# Decisions

## 2026-08-14 - SDK changes use the governed coding route

Decision: keep pinned workspace installation and the complete SDK verifier in
`.flyto/coding.yaml`. Public package copy, plugin contracts, and UI behavior
require an independent Codex audit after that gate.

Reason: the SDK crosses process, browser, and package-publication boundaries;
a single committed entry keeps all of those checks attached to every change.

## 2026-06-21 - Project memory bootstrapped

Decision: track Flyto2 product-line role, repo boundary, state, roadmap, tasks,
and handoffs in this repo.

Reason: `flyto-plugins-js` must be maintainable by future agents without relying on
conversation memory.

## 2026-07-22 - Source-derived contracts are release gates

Decision: derive source API, plugin contracts, and token references from the
TypeScript/JavaScript/HTML AST, YAML manifests, and CSS. Reject stale generated
files, missing declaration summaries, package/manifest drift, and unsafe
tarball contents in `npm run verify`.

Reason: a public SDK needs one testable contract. Hand-maintained tables alone
cannot prove every named method, embedded UI helper, manifest step, or token is
documented and current.

## 2026-07-22 - Publish public packages only to npmjs.com with OIDC

Decision: every workspace uses the public npmjs.com registry. Tagged releases
use GitHub Actions OIDC trusted publishing and npm provenance; no long-lived
`NPM_TOKEN` is read by the workflow.

Reason: a single public registry avoids accidental split publication, while
short-lived identity removes a reusable package credential from repository
secrets.

## 2026-07-22 - Loopback UI request IDs are capabilities

Decision: bind UI servers to loopback, resolve real paths, allow callback CORS
only from the exact active origin, reject malformed or unknown callbacks, and
never put secrets in browser props.

Reason: the UI URL crosses a browser boundary. The random request ID controls a
single pending result and must be handled as a bearer capability.
