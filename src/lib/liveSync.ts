import { prisma } from "./prisma";
import { isLiveConfigured } from "./providers";
import { syncLiveResults } from "./sync";
import { log } from "./log";

// Adaptive, budget-aware live polling. Clients poll /api/live frequently, but we
// only call the upstream football API when something is actually happening:
//
//   • a match is live, or kicked off but not yet final  -> every 25 s
//   • next kickoff is within 15 min                      -> every 25 s
//   • a match is coming up within 6 h                    -> every 10 min
//   • otherwise (idle)                                   -> every 6 h
//
// 25 s during live play is ~2.4 calls/min — well inside football-data.org's
// 10/min — so scores feel near-real-time while costing almost nothing when idle.
// The throttle is app-wide, so any number of watching clients share one sync.
const SEC = 1000;
const MIN = 60_000;
const LIVE_INTERVAL = 25 * SEC;
let lastSyncAt = 0;
let syncing = false;

async function desiredIntervalMs(now: number): Promise<number> {
  const [liveOrStale, next] = await Promise.all([
    prisma.match.count({
      where: {
        OR: [{ status: "LIVE" }, { AND: [{ kickoff: { lte: new Date(now) } }, { status: { not: "FINISHED" } }] }],
      },
    }),
    prisma.match.findFirst({
      where: { kickoff: { gt: new Date(now) } },
      orderBy: { kickoff: "asc" },
      select: { kickoff: true },
    }),
  ]);

  if (liveOrStale > 0) return LIVE_INTERVAL;
  if (next) {
    const untilNext = next.kickoff.getTime() - now;
    if (untilNext <= 15 * MIN) return LIVE_INTERVAL;
    if (untilNext <= 6 * 60 * MIN) return 10 * MIN;
  }
  return 6 * 60 * MIN;
}

// Called from /api/live. Runs a sync only when one is due given the schedule;
// otherwise returns immediately and the client just reads current DB state.
export async function maybeSync(): Promise<void> {
  if (!isLiveConfigured()) return;
  const now = Date.now();
  if (syncing) return;
  const interval = await desiredIntervalMs(now);
  if (now - lastSyncAt < interval) return;
  syncing = true;
  lastSyncAt = now;
  try {
    await syncLiveResults();
  } catch (e) {
    log.error("livesync.failed", { err: e });
  } finally {
    syncing = false;
  }
}
