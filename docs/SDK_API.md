# SDK API Reference

## Package Entry Point

`@flyto2/plugin-sdk` exports:

- `createPlugin(config): FlytoPlugin`
- `FlytoPlugin`
- `UIServer`
- `JsonRpcRequest`, `JsonRpcResponse`, and `JsonRpcError`
- `PluginConfig`, `HandshakeParams`, and `InvokeParams`
- `StepHandler`, `StepContext`, and `StepResult`
- `StepUIConfig`, `UIResult`, `UIServerConfig`, `UIWaitOptions`,
  `UIStepContext`, and `UIStepHandler`

## `FlytoPlugin`

| Method | Contract |
| --- | --- |
| `constructor(config)` | Requires a `vendor/name` runtime ID and semantic version; stores an immutable config copy. |
| `step(stepId, handler)` | Registers one async headless handler; malformed or duplicate IDs throw before startup. |
| `uiStep(stepId, uiConfig, handler)` | Registers one UI handler after validating its relative page, mode, dimensions, and timeout; duplicates throw. |
| `start()` | Starts newline-delimited stdin dispatch once, writes responses/notifications to stdout, diagnostics to stderr, and handles SIGTERM. |

Handler input and context must be objects. Context maps string-valued
`execution_id`, browser endpoint/token, and resolved secrets while preserving
the untouched raw Core context; non-string secret values are omitted. A handler
must return `{ok: true, data?}` or `{ok: false, error: {code, message}}`.
Malformed results become a structured `EXECUTION_ERROR` rather than escaping
onto the protocol stream.

## Protocol Methods

| Method | Response |
| --- | --- |
| `handshake` | Plugin and protocol versions, all step IDs, and optional UI dimensions/type. |
| `invoke` | Structured step result; unknown IDs return `STEP_NOT_FOUND`. |
| `ping` | `{status: "ok"}`. |
| `shutdown` | `{status: "shutdown"}`, then UI cleanup and process exit. |

Malformed envelopes return JSON-RPC `-32600`; missing step IDs or non-object
invoke input/context return `-32602`. Messages with no JSON-RPC ID are treated
as notifications and receive no response. Current protocol version is `0.1.0`.

## `UIServer`

| Method | Contract |
| --- | --- |
| `constructor({uiRoot})` | Requires an existing directory and stores its resolved real path as the only static-file root. |
| `start()` | Binds `127.0.0.1` on a free port and returns that port; repeated calls reuse it. |
| `stop()` | Rejects pending waits, clears timers, and closes the listener. |
| `getPort()` | Returns the selected port while running and `0` after stop. |
| `waitForUI({requestId?, timeoutMs?})` | Waits for a unique matching submit/cancel; default timeout is 300,000 ms and non-positive timeouts throw. |
| `buildUIUrl(page, requestId, props?)` | Requires a running server and safely encodes the loopback callback capability and props. |

The server also exposes internal bridge/token paths and a POST callback. These
are implementation endpoints, not public internet APIs.

## UI Bridge API

`@flyto2/plugin-ui-bridge` exports `createBridge(options?)` and `getBridge()`.
The returned bridge has read-only `props`, `submit(data)`, `cancel()`,
`onProps(handler)`, and `onTheme(handler)`. Importing `./auto` creates the
singleton and assigns the compatibility browser global used by existing UIs.

Set `options.origin` to the exact HTTP(S) parent origin in hosted iframes.
Omitting it falls back to an injected origin parameter and then `*`, which is
only appropriate for a trusted local page. Incoming messages must also come
from the actual parent window. Submit data and update handlers are type checked.

## UI Token API

`@flyto2/plugin-ui-tokens` exports `tokens.css` and the `./inject` subpath.
`injectTokens(tokens, target?)` sets only string-valued `--flyto-*` custom
properties on the supplied element or document root. `readTokens()` reads
declared `--flyto-*` variables from accessible stylesheets and skips
cross-origin sheets it cannot inspect.

The exhaustive source-derived reference is in
[`generated/source-api.md`](generated/source-api.md).
