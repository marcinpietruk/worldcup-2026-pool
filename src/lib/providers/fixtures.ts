import type { Stage, MatchStatus } from "@prisma/client";

// A provider-agnostic fixture shape. Both the canonical seed (openfootball) and
// the live source (API-Football) are normalized to this before touching the DB.
export type NormalizedFixture = {
  externalId: string;
  stage: Stage;
  group: string | null; // "A".."L" for group games
  matchday: number | null; // per-group 1..3 for group games (assigned in seed)
  kickoff: Date; // UTC
  homeName: string | null; // canonical team name, when known
  awayName: string | null;
  homeLabel: string | null; // placeholder text when the team is not yet known
  awayLabel: string | null;
  homeScore: number | null;
  awayScore: number | null;
  // Winner side for knockout matches (covers penalty shootouts). null = draw/none.
  winner: "HOME" | "AWAY" | null;
  status: MatchStatus;
  // Live clock for in-play matches ("27'", "HT"), when the provider supplies it.
  statusDetail?: string | null;
};

// Map a round/stage string from any source to our Stage enum.
export function mapStage(round: string): Stage {
  const r = round.toLowerCase();
  // Order matters: "semi-final"/"quarter-final"/"third place" all contain "final".
  if (r.includes("third") || r.includes("3rd")) return "THIRD_PLACE";
  if (r.includes("semi")) return "SF";
  if (r.includes("quarter")) return "QF";
  if (r.includes("round of 32") || r.includes("1/16")) return "R32";
  if (r.includes("round of 16") || r.includes("1/8")) return "R16";
  if (r.includes("final")) return "FINAL";
  return "GROUP"; // "Matchday N", "Group A - 1", etc.
}

// Parse "2026-06-11" + "13:00 UTC-6" -> a UTC Date.
export function parseKickoffUtc(date: string, time: string | undefined): Date {
  if (!time) return new Date(`${date}T00:00:00Z`);
  const m = time.match(/(\d{1,2}):(\d{2})\s*UTC\s*([+-]?\d{1,2})/i);
  if (!m) return new Date(`${date}T${time}Z`);
  const [, hh, mm, offsetStr] = m;
  const [y, mo, d] = date.split("-").map(Number);
  const offsetHours = parseInt(offsetStr, 10);
  // wall-clock local time is at UTC+offset, so the UTC instant is local - offset.
  const utcMs =
    Date.UTC(y, mo - 1, d, parseInt(hh, 10), parseInt(mm, 10)) - offsetHours * 3600_000;
  return new Date(utcMs);
}
