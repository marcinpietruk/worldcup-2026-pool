import { prisma } from "./prisma";
import { isMatchLocked } from "./scoring";
import { iso2For } from "./teams";
import type { Match, Team } from "@prisma/client";

export type TeamDTO = { id: string; name: string; flag: string | null; code: string | null; iso2: string | null; group?: string | null };

export type MatchDTO = {
  id: string;
  number: number;
  stage: string;
  group: string | null;
  matchday: number | null;
  kickoff: string; // ISO UTC
  status: string;
  // For knockout matches: the match numbers whose winners feed each slot
  // (parsed from "W74"-style labels). null for the R32 / group-fed slots.
  sourceHomeNum: number | null;
  sourceAwayNum: number | null;
  home: TeamDTO | null;
  away: TeamDTO | null;
  homeLabel: string | null;
  awayLabel: string | null;
  homeScore: number | null;
  awayScore: number | null;
  locked: boolean;
};

type MatchWithTeams = Match & { homeTeam: Team | null; awayTeam: Team | null };

const teamDto = (t: Team | null): TeamDTO | null =>
  t ? { id: t.id, name: t.name, flag: t.flag, code: t.code, iso2: iso2For(t.name) } : null;

const sourceNum = (label: string | null): number | null => {
  const m = label?.match(/^W(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
};

// Serialize one match (with its teams included) to a DTO.
export function serializeMatch(m: MatchWithTeams, now = new Date()): MatchDTO {
  return {
    id: m.id,
    number: m.number,
    stage: m.stage,
    group: m.group,
    matchday: m.matchday,
    kickoff: m.kickoff.toISOString(),
    status: m.status,
    sourceHomeNum: sourceNum(m.homeLabel),
    sourceAwayNum: sourceNum(m.awayLabel),
    home: teamDto(m.homeTeam),
    away: teamDto(m.awayTeam),
    homeLabel: m.homeLabel,
    awayLabel: m.awayLabel,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    locked: isMatchLocked(m, now),
  };
}

// Fetch all matches as DTOs, ordered by kickoff.
export async function getMatchDTOs(now = new Date()): Promise<MatchDTO[]> {
  const matches = await prisma.match.findMany({
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoff: "asc" },
  });
  return matches.map((m) => serializeMatch(m, now));
}

export async function getTeamDTOs(): Promise<TeamDTO[]> {
  const teams = await prisma.team.findMany({ orderBy: [{ group: "asc" }, { name: "asc" }] });
  return teams.map((t) => ({ id: t.id, name: t.name, flag: t.flag, code: t.code, iso2: iso2For(t.name), group: t.group }));
}
