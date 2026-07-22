# Feature Reference

## JSON-RPC Plugin Runtime

`FlytoPlugin` registers headless or UI handlers and dispatches JSON-RPC 2.0
requests over stdin/stdout. It supports handshake, invoke, ping, and shutdown;
unknown methods use JSON-RPC error `-32601`, while handler failures become a
structured `EXECUTION_ERROR` step result.

## Interactive UI Runtime

`UIServer` binds only to loopback, serves a configured static UI root, injects
the Flyto2 bridge and tokens, and resolves a pending invocation after submit or
cancel. It supports page, panel, and dialog metadata and a default five-minute
wait unless the step supplies another timeout.

## UI Bridge

`createBridge()` exposes props, submit, cancel, prop updates, and theme updates
to an iframe. It uses the SDK callback endpoint when local URL parameters are
present and falls back to parent `postMessage`. Incoming messages must come
from the parent and, when configured, match its origin.

## UI Tokens

The token package publishes CSS variables and utility classes plus
`injectTokens()` and `readTokens()` for runtime theme updates. Tokens style a
plugin surface; they do not provide full components or accessibility behavior.

## Manifest Contract

`plugin.yaml` declares runtime identity, minimum Core version, entry point,
steps, schemas, connection rules, UI presentation, and required secret names.
It is discovery metadata and must agree with the handlers registered in source.

## Slack Reference Plugin

The Slack plugin sends a message or lists public channels using a resolved
`SLACK_BOT_TOKEN`. It enforces manifest input types and Slack's recommended
1-200 single-page channel limit before resolving credentials.

## Form And Approval Plugin

Form Builder opens a dynamic single-page or wizard form and an approval dialog.
It validates 22 interactive/structural field types, identifiers, options, conditions, and
pattern syntax before opening the UI, then returns structured values, metadata,
decision, and comment state. The host must persist reviewer identity and
authorization if those are required.

## Image Crop Plugin

Image Crop opens a local interactive cropper for URL or data-URL input and
returns a data URL, crop rectangle, and original size. Returned MIME and finite
geometry must match the request. Large data URLs can consume substantial
memory; the SDK callback body limit is 10 MiB.

## Test And Publish Automation

Workspace tests cover protocol dispatch, UI serving, injection hardening, and
reference steps. The root suite currently runs 57 Node tests and 17 Python
process scenarios against freshly built output. Contract checks compare six
packages, three manifests, five registered steps, versions, internal dependency
ranges, secret names, input field names, and UI metadata. Handler tests verify
defaults and constraints. Package checks inspect and install all six npm
tarballs. GitHub Actions run the same strict gate and tagged npmjs.com
publication through OIDC with provenance.
