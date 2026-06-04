import { ok, serverError } from "@/lib/http";
import { getMatchDTOs } from "@/lib/serialize";
import { buildLeaderboard } from "@/lib/scoring";
import { maybeSync } from "@/lib/liveSync";

export const dynamic = "force-dynamic";

// Polled by the client every ~45s. Triggers a throttled live sync (no-op if not
// due or if no API key), then returns current matches + leaderboard.
export async function GET() {
  try {
    await maybeSync();
    const [matches, leaderboard] = await Promise.all([getMatchDTOs(), buildLeaderboard()]);
    return ok({ matches, leaderboard, updatedAt: new Date().toISOString() });
  } catch (e) {
    return serverError(e);
  }
}
