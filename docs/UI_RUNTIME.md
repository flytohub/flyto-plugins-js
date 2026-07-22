# UI Runtime And Security Boundary

## Lifecycle

1. A UI step calls `ctx.waitForUI()` with page, props, mode, dimensions, and
   timeout.
2. The SDK starts a loopback server, registers a random request ID as a pending
   callback capability, then sends Core `ui.open` with the URL.
3. The page receives injected tokens and a `window.flyto` compatibility bridge.
4. Submit or cancel POSTs the request ID to the SDK; the matching promise
   resolves and Core receives `ui.close`. Timeout and shutdown also close the
   host UI.

## HTTP Surface

The server binds to `127.0.0.1`, confines static files to the real path of
`uiRoot` (including symlink resolution), limits callback bodies to 10 MiB by
byte count, escapes inline script values, and serves only known MIME types plus
a binary fallback. Missing routes may use `index.html` as an SPA fallback.

Responses use `no-store`, `no-referrer`, `nosniff`, and same-origin resource
policy. Callback CORS accepts only the exact active loopback origin. A callback
must be JSON, use `submit` or `cancel`, carry a nonempty pending request ID, and
provide an object for submit data. Unknown or already-consumed capabilities are
rejected.

The callback request ID is a bearer capability. Do not log or expose the full
UI URL, and do not serve the loopback listener through a proxy. Stop the server
after the owning process exits.

## Messaging Surface

Bridge messages use a `flyto-plugin:` prefix. The bridge checks that messages
come from `window.parent`, accepts only normalized HTTP(S) parent origins, and
enforces the configured origin when it is not `*`. Production hosts must inject
or pass the exact parent origin; wildcard mode is for trusted local development
only. A failed or non-2xx loopback callback falls back to parent messaging.

## Props, Secrets, And Results

UI props are visible to browser code and URL-adjacent runtime machinery. Never
put API keys, passwords, cookies, private keys, or unrestricted tokens in props.
Resolved secrets remain in headless `StepContext.secrets` and should be passed
to provider SDKs without entering UI output.

Treat submitted data as untrusted. Validate types, lengths, URLs, file content,
and business authorization in the plugin or owning Core/Cloud service.

## Frontend Requirements

Plugin UIs must support keyboard interaction, visible focus, labels, errors,
loading/cancel states, responsive dimensions, and sufficient contrast. Use the
token package for visual compatibility, not as a substitute for semantic HTML
or accessibility testing.

The current reference Form Builder and Image Crop pages demonstrate the data
contract, but keyboard operation of every custom form control and crop-handle
adjustment remains tracked as release work in [`tasks.md`](../tasks.md).
