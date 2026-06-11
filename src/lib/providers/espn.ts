import { canonicalTeamName, isCanonicalTeam } from "../teams";
import { mapStage, type MatchEvent, type NormalizedFixture } from "./fixtures";
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
  records?: Array<{ type?: string; summary?: string }>;
  team?: { id?: string; displayName?: string | null };
};
type EspnDetail = {
  type?: { text?: string };
  clock?: { displayValue?: string };
  team?: { id?: string };
  athletesInvolved?: Array<{ displayName?: string }>;
};
type EspnEvent = {
  id: string;
  date: string;
  season?: { slug?: string | null };
  competitions?: Array<{
    competitors?: EspnCompetitor[];
    status?: { type?: { state?: string; detail?: string; shortDetail?: string } };
    details?: EspnDetail[];
    venue?: { fullName?: string; address?: { city?: string } };
    attendance?: number;
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

function eventType(text: string | undefined): MatchEvent["type"] | null {
  const t = (text ?? "").toLowerCase();
  if (t.includes("goal")) return "goal";
  if (t.includes("yellow")) return "yellow";
  if (t.includes("red")) return "red";
  return null; // substitutions, VAR, etc. — not shown
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
  const type = comp?.status?.type;
  const status = espnStatus(type?.state);
  const started = status !== "SCHEDULED";
  // Only trust a score once the match is under way; a "pre" event reports 0.
  const toScore = (c?: EspnCompetitor) =>
    started && c?.score != null && c.score !== "" ? Number(c.score) : null;

  // Goal/card timeline, keyed by team name so it survives a home/away swap.
  const teamById = new Map<string, string | null>();
  for (const c of cs) if (c.team?.id) teamById.set(c.team.id, teamOrNull(c.team?.displayName));
  const events: MatchEvent[] = (comp?.details ?? [])
    .map((d): MatchEvent | null => {
      const kind = eventType(d.type?.text);
      if (!kind) return null;
      return {
        min: d.clock?.displayValue ?? "",
        type: kind,
        team: d.team?.id ? teamById.get(d.team.id) ?? null : null,
        player: d.athletesInvolved?.[0]?.displayName ?? null,
      };
    })
    .filter((x): x is MatchEvent => x !== null);

  const recordOf = (c?: EspnCompetitor) =>
    c?.records?.find((r) => r.type === "total")?.summary ?? c?.records?.[0]?.summary ?? null;
  const venue = comp?.venue?.fullName
    ? [comp.venue.fullName, comp.venue.address?.city].filter(Boolean).join(" · ")
    : null;

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
    // Live clock only while in play ("27'", "HT"); cleared otherwise.
    statusDetail: status === "LIVE" ? type?.shortDetail ?? type?.detail ?? null : null,
    events,
    venue,
    attendance: comp?.attendance && comp.attendance > 0 ? comp.attendance : null,
    homeRecord: recordOf(home),
    awayRecord: recordOf(away),
  };
}
