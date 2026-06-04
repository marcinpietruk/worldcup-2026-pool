import { ok, bad, serverError } from "@/lib/http";
import { syncLiveResults } from "@/lib/sync";

export const dynamic = "force-dynamic";

// Force a live sync. Guarded by REFRESH_SECRET so an external scheduler
// (GitHub Actions / cron-job.org) can call it: /api/refresh?secret=...
async function handle(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.REFRESH_SECRET || secret !== process.env.REFRESH_SECRET) {
    return bad("Unauthorized", 401);
  }
  try {
    const result = await syncLiveResults();
    return ok(result);
  } catch (e) {
    return serverError(e);
  }
}

export const GET = handle;
export const POST = handle;
