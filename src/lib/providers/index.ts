import type { NormalizedFixture } from "./fixtures";
import * as espn from "./espn";
import * as footballData from "./footballData";
import * as apiFootball from "./apiFootball";

export type LiveProvider = {
  name: string;
  fetchLiveFixtures: () => Promise<NormalizedFixture[]>;
};

// Pick the live-results provider. ESPN's public API is preferred: no key, and it
// actually serves real-time in-play scores (football-data.org's free tier only
// reliably settles the final result). Set USE_ESPN=0 to fall back to
// football-data.org (free tier covers WC 2026 fixtures + finals). API-Football
// only fires when explicitly opted in via USE_API_FOOTBALL=1 — its FREE tier
// can't serve 2026, so we don't want it burning the daily quota by accident.
// Returns null when none is active; the app then runs on the bundled fixtures +
// manual admin entry.
export function getLiveProvider(): LiveProvider | null {
  if (espn.isConfigured()) {
    return { name: "espn", fetchLiveFixtures: espn.fetchLiveFixtures };
  }
  if (footballData.isConfigured()) {
    return { name: "football-data.org", fetchLiveFixtures: footballData.fetchLiveFixtures };
  }
  if (apiFootball.isApiConfigured() && process.env.USE_API_FOOTBALL === "1") {
    return { name: "api-football", fetchLiveFixtures: apiFootball.fetchLiveFixtures };
  }
  return null;
}

export function isLiveConfigured(): boolean {
  return getLiveProvider() !== null;
}
