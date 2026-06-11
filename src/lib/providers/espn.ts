import { canonicalTeamName, isCanonicalTeam } from "../teams";
import { mapStage, type NormalizedFixture } from "./fixtures";
import type { MatchStatus } from "@prisma/client";

// Live results provider backed by ESPN's public scoreboard API. No API key
// required, and — unlike football-data.org's free tier — it serves real-time
// in-play scores. One ranged request returns every WC 2026 fixture with current
// status and score.
//
// Phase comes from the event's season.slug ("group-stage", "round-of-32",
// "quarterfinals", "3rd-place-match", "final", …) which maps onto our Stage via
// mapStage once hyphens are spaces. ESPN's scoreboard doesn't expose the group
// letter, so group games carry group=null and are matched on the team pair (a
// pairing is unique within the group stage). Knockout slots not yet decided come
// back as placeholders like "Group A 2nd Place" — guarded out via isCanonicalTeam
// so the sync never creates a phantom team.

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const RANGE = "20260611-20260719"; // whole tournament; limit=500 returns all 104

type EspnCompetitor = {
  homeAway?: "home" | "away";
  score?: string | null;
  winner?: boolean;
  team?: { displayName?: string | null };
};
type EspnEvent = {
  id: string;
  date: string;
  season?: { slug?: string | null };
  competitions?: Array<{
    competitors?: EspnCompetitor[];
    status?: { type?: { state?: string } };
  }>;
};

function espnStatus(state: string | undefined): MatchStatus {
  if (state === "in") return "LIVE";
  if (state === "post") return "FINISHED";
  return "SCHEDULED"; // "pre"
}

// Real country, or null for a bracket placeholder ("Group C Winner" etc.).
function teamOrNull(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const name = canonicalTeamName(displayName);
  return isCanonicalTeam(name) ? name : null;
}

export function isConfigured(): boolean {
  // No key needed, so on by default. Set USE_ESPN=0 to fall back to football-data.
  return process.env.USE_ESPN !== "0";
}

export async function fetchLiveFixtures(): Promise<NormalizedFixture[]> {
  const res = await fetch(`${BASE}?dates=${RANGE}&limit=500`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { events?: EspnEvent[] };
  return (data.events ?? []).map(parseEspnEvent);
}

// Exported for unit testing the transform without a live call.
export function parseEspnEvent(e: EspnEvent): NormalizedFixture {
  const comp = e.competitions?.[0];
  const cs = comp?.competitors ?? [];
  const home = cs.find((c) => c.homeAway === "home");
  const away = cs.find((c) => c.homeAway === "away");
  const stage = mapStage((e.season?.slug ?? "").replace(/-/g, " "));
  const status = espnStatus(comp?.status?.type?.state);
  const started = status !== "SCHEDULED";
  // Only trust a score once the match is under way; a "pre" event reports 0.
  const toScore = (c?: EspnCompetitor) =>
    started && c?.score != null && c.score !== "" ? Number(c.score) : null;
  return {
    externalId: `espn-${e.id}`,
    stage,
    group: null, // ESPN doesn't expose the group letter; matched by team pair
    matchday: null,
    kickoff: new Date(e.date),
    homeName: teamOrNull(home?.team?.displayName),
    awayName: teamOrNull(away?.team?.displayName),
    homeLabel: null,
    awayLabel: null,
    homeScore: toScore(home),
    awayScore: toScore(away),
    // ESPN flags the advancing side as the winner (covers penalty shootouts).
    winner: home?.winner ? "HOME" : away?.winner ? "AWAY" : null,
    status,
  };
}
