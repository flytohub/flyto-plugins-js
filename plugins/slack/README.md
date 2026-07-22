# @flyto2/plugin-slack

Slack Web API reference integration for Flyto2 workflows.

## Install

```bash
npm install @flyto2/plugin-slack
```

Provide `SLACK_BOT_TOKEN` through the Flyto2 secret context or process
environment. The bot needs `chat:write` for `send_message` and `channels:read`
for `list_channels`.

## Steps

- `send_message` requires a channel and message, optionally replies with
  `thread_ts`, changes Slack state, and returns the resulting channel/timestamp.
- `list_channels` returns one page of public channels. `limit` defaults to 100
  and must be an integer from 1-200; numeric strings are rejected and cursor
  pagination is not implemented.

See the [generated input/output contract](https://github.com/flytohub/flyto-plugins-js/blob/main/docs/generated/plugin-contracts.md#slack).

## Security

Use the least-privileged bot scopes and keep the token out of input, logs, and
outputs. Hosts should authorize destination channels and apply rate limits
before invoking message creation.

Licensed under Apache-2.0. Report vulnerabilities to `security@flyto2.com`.
