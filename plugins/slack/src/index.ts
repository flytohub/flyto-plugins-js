// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/** Flyto2 Slack Web API reference plugin. */

import { createPlugin } from "@flyto2/plugin-sdk";
import type { StepContext, StepResult } from "@flyto2/plugin-sdk";
import { WebClient } from "@slack/web-api";

/** Resolve the Slack bot token without exposing it in step output. */
function getClient(ctx: Pick<StepContext, "secrets">): WebClient {
  const token = ctx.secrets?.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is required. Set it in secrets or environment.");
  }
  return new WebClient(token);
}

/** Validate and send one Slack channel or thread message. */
export async function sendMessage(
  input: Record<string, unknown>,
  ctx: StepContext,
): Promise<StepResult> {
  const channel = input.channel;
  const message = input.message;
  const threadTs = input.thread_ts;

  if (typeof channel !== "string" || !channel.trim()
    || typeof message !== "string" || !message.trim()
    || (threadTs !== undefined && (typeof threadTs !== "string" || !threadTs.trim()))) {
    return {
      ok: false,
      error: { code: "INVALID_PARAMS", message: "Both 'channel' and 'message' are required" },
    };
  }

  const result = await getClient(ctx).chat.postMessage({
    channel,
    text: message,
    thread_ts: threadTs,
  });

  return { ok: true, data: { ts: result.ts, channel: result.channel } };
}

/** Validate the page limit and list one page of public Slack channels. */
export async function listChannels(
  input: Record<string, unknown>,
  ctx: StepContext,
): Promise<StepResult> {
  const limit = input.limit === undefined ? 100 : input.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 200) {
    return {
      ok: false,
      error: { code: "INVALID_PARAMS", message: "'limit' must be an integer from 1 through 200" },
    };
  }

  const result = await getClient(ctx).conversations.list({
    types: "public_channel",
    limit,
  });
  const channels = (result.channels || []).map((channel) => ({
    id: channel.id,
    name: channel.name,
    topic: channel.topic?.value || "",
    member_count: channel.num_members || 0,
  }));

  return { ok: true, data: { channels } };
}

/** Registered Slack plugin instance used by Core and tests. */
export const plugin = createPlugin({
  id: "flyto-community/slack",
  version: "0.1.0",
  name: "Slack",
});

plugin.step("send_message", sendMessage);
plugin.step("list_channels", listChannels);

if (require.main === module) plugin.start();
