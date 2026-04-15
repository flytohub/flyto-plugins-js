// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Flyto2 Slack Plugin
 *
 * Reference implementation of a TypeScript plugin using @flyto2/plugin-sdk.
 */

import { createPlugin } from "@flyto2/plugin-sdk";
import { WebClient } from "@slack/web-api";

const plugin = createPlugin({
  id: "flyto-community/slack",
  version: "0.1.0",
  name: "Slack",
});

function getClient(ctx: { secrets?: Record<string, string> }): WebClient {
  const token = ctx.secrets?.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is required. Set it in secrets or environment.");
  }
  return new WebClient(token);
}

// ── send_message ──────────────────────────────────────────────

plugin.step("send_message", async (input, ctx) => {
  const client = getClient(ctx);

  const channel = input.channel as string;
  const message = input.message as string;
  const threadTs = input.thread_ts as string | undefined;

  if (!channel || !message) {
    return {
      ok: false,
      error: {
        code: "INVALID_PARAMS",
        message: "Both 'channel' and 'message' are required",
      },
    };
  }

  const result = await client.chat.postMessage({
    channel,
    text: message,
    thread_ts: threadTs,
  });

  return {
    ok: true,
    data: {
      ts: result.ts,
      channel: result.channel,
    },
  };
});

// ── list_channels ─────────────────────────────────────────────

plugin.step("list_channels", async (input, ctx) => {
  const client = getClient(ctx);

  const limit = (input.limit as number) || 100;

  const result = await client.conversations.list({
    types: "public_channel",
    limit,
  });

  const channels = (result.channels || []).map((ch) => ({
    id: ch.id,
    name: ch.name,
    topic: ch.topic?.value || "",
    member_count: ch.num_members || 0,
  }));

  return {
    ok: true,
    data: { channels },
  };
});

// ── Start plugin ──────────────────────────────────────────────

plugin.start();
