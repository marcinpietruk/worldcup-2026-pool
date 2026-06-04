import type { NormalizedFixture } from "./fixtures";
import * as footballData from "./footballData";
import * as apiFootball from "./apiFootball";

export type LiveProvider = {
  name: string;
  fetchLiveFixtures: () => Promise<NormalizedFixture[]>;
};

// Pick the configured live-results provider. football-data.org is preferred
// (its free tier covers WC 2026). API-Football only fires when explicitly opted
// in via USE_API_FOOTBALL=1 — its FREE tier can't serve 2026, so we don't want
// it triggering by accident and burning the daily quota. Returns null when none
// is active; the app then runs on the bundled fixtures + manual admin entry.
export function getLiveProvider(): LiveProvider | null {
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
