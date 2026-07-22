# Reference Plugin Contracts

## Slack

Runtime ID: `flyto-community/slack`. Required secret: `SLACK_BOT_TOKEN`, resolved
from Core context first and process environment second.

| Step | Inputs | Output and effect |
| --- | --- | --- |
| `send_message` | required `channel`, `message`; optional `thread_ts` | Calls Slack `chat.postMessage`; returns message timestamp and channel. This changes external Slack state. |
| `list_channels` | optional integer `limit` default 100, range 1-200 | Calls `conversations.list` for public channels and returns ID, name, topic, and member count. |

The current list operation returns one API page; it does not follow cursors.

## Form Builder

Runtime ID: `flyto-community/form-builder`. No declared secrets.

| Step | Inputs | Output and behavior |
| --- | --- | --- |
| `collect_form` | required `title`, `fields`; optional `description`, `mode`, `submit_label` | Opens a 720 x 700 dialog for up to 30 minutes. Returns `submitted`, values, and metadata. Closing returns a successful cancelled result. |
| `approval_form` | required `title`; optional context, fields, comment rule, button labels | Opens a 640 x 600 dialog for up to 30 minutes. Returns decision, comment, and values. Closing maps to rejected. |

The plugin records neither reviewer identity nor durable approval evidence; the
host must add those controls when approval has security or compliance impact.

## Image Crop

Runtime ID: `flyto-community/image-crop`. No declared secrets.

`crop_image` requires `image_url`. Optional inputs are aspect ratio (`free`,
`1:1`, `16:9`, `4:3`, or `9:16`), output MIME type (PNG, JPEG, or WebP), and
quality (default `0.92`). It opens a 900 x 650 dialog for up to ten minutes and
returns `cropped_data_url`, `crop_rect`, and `original_size`. Cancel returns
`USER_CANCELLED`.

The handler accepts only HTTP, HTTPS, `blob:`, or image data URLs and validates
aspect ratio, output MIME type, numeric quality, exact returned data-URL MIME,
finite nonnegative crop coordinates, and positive crop/original dimensions.
The browser may still contact an external origin, so hosts should enforce
network allowlists, DNS policy, and payload limits before invoking it.

## Manifest Parity

The five step IDs, defaults, constraints, secrets, dimensions, timeouts, and
schemas above must stay aligned between each `plugin.yaml`, TypeScript
registration, compiled `dist`, package version, and tests. `npm run contracts`
parses YAML and the TypeScript AST; `npm run docs` rejects stale generated
contracts.
