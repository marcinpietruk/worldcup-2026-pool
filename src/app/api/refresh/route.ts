import { ok, bad, serverError } from "@/lib/http";
import { syncLiveResults } from "@/lib/sync";
import { shouldSyncNow } from "@/lib/liveSync";

export const dynamic = "force-dynamic";

// Called by an external scheduler (GitHub Actions / cron-job.org) on a fixed
// cadence. Guarded by REFRESH_SECRET. "Smart" by default: it only spends an
// upstream call when a match is live or kicking off soon — so a 5-minute cron
// is near-real-time during games and a free no-op the rest of the time.
// Pass &force=1 to sync unconditionally (manual/admin use).
async function handle(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!process.env.REFRESH_SECRET || secret !== process.env.REFRESH_SECRET) {
    return bad("Unauthorized", 401);
  }
  try {
    const force = url.searchParams.get("force") === "1";
    if (!force && !(await shouldSyncNow())) {
      return ok({ skipped: true, reason: "no live or imminent matches" });
    }
    const result = await syncLiveResults();
    return ok(result);
  } catch (e) {
    return serverError(e);
  }
}

export const GET = handle;
export const POST = handle;
