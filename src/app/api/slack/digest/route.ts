import { ok, bad, serverError } from "@/lib/http";
import { buildDigest, renderDigestBlocks, saveDigestSnapshot } from "@/lib/digest";
import { postToSlack, slackConfigured } from "@/lib/slack";
import { recomputeAll } from "@/lib/scoring";

export const dynamic = "force-dynamic";

// Posts the daily digest to Slack. Called by the daily GitHub Action, guarded by
// REFRESH_SECRET (the same secret the live-refresh cron uses). Like /api/refresh
// it's "smart": on a quiet day (no results since the last digest, no games today)
// it posts nothing.
//   ?dry=1    render and return the blocks as JSON — don't post, don't touch the
//             movement baseline. For previewing.
//   ?force=1  post even on a quiet day.
async function handle(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!process.env.REFRESH_SECRET || secret !== process.env.REFRESH_SECRET) {
    return bad("Unauthorized", 401);
  }
  try {
    const dry = url.searchParams.get("dry") === "1";
    const force = url.searchParams.get("force") === "1";

    // Make sure points reflect the latest results before we report them. Cheap
    // at office scale and idempotent.
    await recomputeAll();
    const digest = await buildDigest(new Date());
    const { text, blocks } = renderDigestBlocks(digest);

    // Preview: always render, never post, never advance the movement baseline.
    if (dry) {
      return ok({ dry: true, hasContent: digest.hasContent, text, blocks });
    }
    // Quiet day: nothing new and no games → stay silent (unless forced).
    if (!digest.hasContent && !force) {
      return ok({ posted: false, skipped: true, reason: "no results since last digest and no games today" });
    }
    if (!slackConfigured()) {
      return ok({ posted: false, skipped: true, reason: "Slack not configured (set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID)" });
    }

    await postToSlack({ text, blocks });
    await saveDigestSnapshot(digest); // advance the movement baseline
    return ok({ posted: true, results: digest.recap.length, fixtures: digest.fixtures.length });
  } catch (e) {
    return serverError(e);
  }
}

export const GET = handle;
export const POST = handle;
