import type { MatchDTO } from "./client";

export const STAGE_LABEL: Record<string, string> = {
  GROUP: "Group Stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  THIRD_PLACE: "Third-place Play-off",
  FINAL: "Final",
};

export const STAGE_ORDER = ["GROUP", "R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"];

// Kickoffs are stored UTC; format in the viewer's local timezone.
export function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export type Side = { name: string; flag: string; faded: boolean };

export function sideOf(match: MatchDTO, which: "home" | "away"): Side {
  const team = which === "home" ? match.home : match.away;
  const label = which === "home" ? match.homeLabel : match.awayLabel;
  if (team) return { name: team.name, flag: team.flag ?? "", faded: false };
  return { name: label ?? "TBD", flag: "", faded: true };
}
