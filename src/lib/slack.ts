import { log } from "./log";

// Thin wrapper over Slack's Web API for posting the daily digest. Uses a Slack
// *app* bot token (chat.postMessage) — the bot must be invited to the target
// channel. Config lives in two env vars:
//   SLACK_BOT_TOKEN   the "Bot User OAuth Token" (xoxb-…) from the Slack app
//   SLACK_CHANNEL_ID  the channel to post into (e.g. C0123ABCD)

// A Slack Block Kit block. We don't type the full schema — just enough to pass
// blocks through to the API.
export type SlackBlock = Record<string, unknown>;

export function slackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID);
}

// Posts a message and returns its timestamp id. Throws on any Slack-level error
// (bad token, bot not in channel, …) so the caller surfaces it rather than
// silently dropping the digest.
export async function postToSlack(args: { text: string; blocks?: SlackBlock[] }): Promise<{ ts: string }> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!token || !channel) {
    throw new Error("Slack not configured (set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID).");
  }

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      text: args.text, // notification fallback (shown in the sidebar / push)
      blocks: args.blocks,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  // Slack returns HTTP 200 even for logical errors; the real status is in `ok`.
  const data = (await res.json()) as { ok: boolean; ts?: string; error?: string };
  if (!data.ok) {
    log.error("slack.post_failed", { error: data.error });
    throw new Error(`Slack rejected the message: ${data.error ?? "unknown error"}`);
  }
  return { ts: data.ts ?? "" };
}
