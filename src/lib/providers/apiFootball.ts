import { canonicalTeamName } from "../teams";
import { mapStage, type NormalizedFixture } from "./fixtures";
import type { MatchStatus } from "@prisma/client";

// Live results provider backed by API-Football (api-sports.io v3).
// One request to /fixtures?league=..&season=.. returns every World Cup fixture
// with current status and scores, which keeps us well within the free tier.

const FINISHED = new Set(["FT", "AET", "PEN"]);
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"]);

type ApiFixture = {
  fixture: { id: number; date: string; status: { short: string } };
  league: { round: string };
  teams: {
    home: { name: string; winner?: boolean | null };
    away: { name: string; winner?: boolean | null };
  };
  goals: { home: number | null; away: number | null };
};

function statusFromShort(short: string): MatchStatus {
  if (FINISHED.has(short)) return "FINISHED";
  if (LIVE.has(short)) return "LIVE";
  return "SCHEDULED";
}

// "Group A - 1" -> { group: "A", matchday: 1 }
function parseGroupRound(round: string): { group: string | null; matchday: number | null } {
  const m = round.match(/group\s+([a-l])\s*-\s*(\d)/i);
  if (!m) return { group: null, matchday: null };
  return { group: m[1].toUpperCase(), matchday: parseInt(m[2], 10) };
}

export function isApiConfigured(): boolean {
  return Boolean(process.env.FOOTBALL_API_KEY);
}

export async function fetchLiveFixtures(): Promise<NormalizedFixture[]> {
  const key = process.env.FOOTBALL_API_KEY;
  if (!key) throw new Error("FOOTBALL_API_KEY is not set");

  const host = process.env.FOOTBALL_API_HOST || "v3.football.api-sports.io";
  const league = process.env.FOOTBALL_LEAGUE_ID || "1"; // FIFA World Cup
  const season = process.env.FOOTBALL_SEASON || "2026";
  const url = `https://${host}/fixtures?league=${league}&season=${season}`;

  // api-sports.io direct vs RapidAPI use different auth headers.
  const headers: Record<string, string> = host.includes("rapidapi")
    ? { "x-rapidapi-key": key, "x-rapidapi-host": host }
    : { "x-apisports-key": key };

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`API-Football error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { response: ApiFixture[] };

  return data.response.map((f) => parseApiFixture(f));
}

// Exported for unit testing the transform without a live key.
export function parseApiFixture(f: ApiFixture): NormalizedFixture {
  const stage = mapStage(f.league.round);
  const isGroup = stage === "GROUP";
  const { group, matchday } = isGroup
    ? parseGroupRound(f.league.round)
    : { group: null, matchday: null };
  const homeName = canonicalTeamName(f.teams.home.name);
  const awayName = canonicalTeamName(f.teams.away.name);
  return {
    externalId: `apif-${f.fixture.id}`,
    stage,
    group,
    matchday,
    kickoff: new Date(f.fixture.date),
    homeName,
    awayName,
    homeLabel: null,
    awayLabel: null,
    homeScore: f.goals.home,
    awayScore: f.goals.away,
    winner: f.teams.home.winner ? "HOME" : f.teams.away.winner ? "AWAY" : null,
    status: statusFromShort(f.fixture.status.short),
  };
}
