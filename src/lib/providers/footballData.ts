import { canonicalTeamName } from "../teams";
import type { NormalizedFixture } from "./fixtures";
import type { Stage, MatchStatus } from "@prisma/client";

// Live results provider backed by football-data.org (v4). Its free tier covers
// the FIFA World Cup. One request to /competitions/WC/matches returns every
// fixture with current status and scores.

const BASE = "https://api.football-data.org/v4";

type FdMatch = {
  id: number;
  utcDate: string;
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | ...
  stage: string; // GROUP_STAGE | LAST_16 | QUARTER_FINALS | ...
  group: string | null; // "GROUP_A" ...
  matchday: number | null;
  homeTeam: { name: string | null };
  awayTeam: { name: string | null };
  score: {
    winner: string | null; // HOME_TEAM | AWAY_TEAM | DRAW | null
    fullTime: { home: number | null; away: number | null };
  };
};

function fdStage(stage: string): Stage {
  const s = (stage || "").toUpperCase();
  if (s.includes("THIRD") || s.includes("3RD")) return "THIRD_PLACE";
  if (s.includes("SEMI")) return "SF";
  if (s.includes("QUARTER")) return "QF";
  if (s.includes("32")) return "R32";
  if (s.includes("16")) return "R16";
  if (s.includes("FINAL")) return "FINAL";
  return "GROUP"; // GROUP_STAGE
}

function fdStatus(status: string): MatchStatus {
  const s = (status || "").toUpperCase();
  if (s === "FINISHED" || s === "AWARDED") return "FINISHED";
  if (s === "IN_PLAY" || s === "PAUSED" || s === "LIVE") return "LIVE";
  return "SCHEDULED"; // TIMED, SCHEDULED, POSTPONED, SUSPENDED, CANCELLED
}

export function isConfigured(): boolean {
  return Boolean(process.env.FOOTBALL_DATA_TOKEN);
}

export async function fetchLiveFixtures(): Promise<NormalizedFixture[]> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error("FOOTBALL_DATA_TOKEN is not set");
  const code = process.env.FOOTBALL_DATA_COMP || "WC";
  const res = await fetch(`${BASE}/competitions/${code}/matches`, {
    headers: { "X-Auth-Token": token },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`football-data.org error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { matches: FdMatch[] };
  return (data.matches ?? []).map(parseFdMatch);
}

// Exported for unit testing the transform without a live token.
export function parseFdMatch(m: FdMatch): NormalizedFixture {
  const stage = fdStage(m.stage);
  const isGroup = stage === "GROUP";
  const group = m.group ? m.group.replace(/^GROUP[_\s]?/i, "").trim() || null : null;
  const homeName = m.homeTeam?.name ? canonicalTeamName(m.homeTeam.name) : null;
  const awayName = m.awayTeam?.name ? canonicalTeamName(m.awayTeam.name) : null;
  return {
    externalId: `fd-${m.id}`,
    stage,
    group: isGroup ? group : null,
    matchday: isGroup ? m.matchday ?? null : null,
    kickoff: new Date(m.utcDate),
    homeName,
    awayName,
    homeLabel: null,
    awayLabel: null,
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    winner:
      m.score?.winner === "HOME_TEAM" ? "HOME" : m.score?.winner === "AWAY_TEAM" ? "AWAY" : null,
    status: fdStatus(m.status),
  };
}
