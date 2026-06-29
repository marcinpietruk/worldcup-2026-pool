import type { MatchDTO } from "./client";

export const KO_STAGES = ["R32", "R16", "QF", "SF", "FINAL"] as const;
export type KoStage = (typeof KO_STAGES)[number];

// The round a winner of `stage` advances INTO (used to map winners -> our
// round-set bracket picks).
const ADVANCES_TO: Record<KoStage, string> = {
  R32: "R16",
  R16: "QF",
  QF: "SF",
  SF: "FINAL",
  FINAL: "CHAMPION",
};

export type Round = { stage: KoStage; matches: MatchDTO[] };

// Order each knockout round by the BRACKET TREE, not by match number, so columns
// line up like a real bracket (each tie sits between the two ties feeding it).
// We lay the tree out from the final down with an in-order walk: every match gets
// a vertical coordinate = the midpoint of its two feeders' coordinates (leaves —
// the R32 ties — take successive slots), then each round is sorted by it.
export function bracketRounds(matches: MatchDTO[]): Round[] {
  const byNum = new Map(matches.map((m) => [m.number, m]));
  const y = new Map<number, number>();
  let leaf = 0;

  const layout = (m: MatchDTO): number => {
    // Recurse into the feeders lowest-match-number first: official bracket
    // numbering then lays the tree out top-to-bottom exactly (e.g. R32 as
    // 74, 77, 73, 75 with R16 #89 above #90).
    const kids = [m.sourceHomeNum, m.sourceAwayNum]
      .filter((n): n is number => n != null)
      .map((n) => byNum.get(n))
      .filter((x): x is MatchDTO => !!x)
      .sort((a, b) => a.number - b.number);
    if (kids.length === 0) {
      const yy = leaf++;
      y.set(m.number, yy);
      return yy;
    }
    const ys = kids.map(layout);
    const yy = (ys[0] + ys[ys.length - 1]) / 2;
    y.set(m.number, yy);
    return yy;
  };

  const root = matches.find((m) => m.stage === "FINAL");
  if (root) layout(root);

  const coord = (m: MatchDTO) => y.get(m.number) ?? m.number;
  return KO_STAGES.map((stage) => ({
    stage,
    matches: matches.filter((m) => m.stage === stage).sort((a, b) => coord(a) - coord(b)),
  }));
}

// The two team ids that can fill a match's slots, given winners picked so far.
// R32 slots come from the resolved fixture; later slots from upstream winners.
export function candidates(
  m: MatchDTO,
  winners: Record<number, string>,
): [string | null, string | null] {
  if (m.sourceHomeNum == null && m.sourceAwayNum == null) {
    return [m.home?.id ?? null, m.away?.id ?? null];
  }
  return [
    m.sourceHomeNum != null ? winners[m.sourceHomeNum] ?? null : null,
    m.sourceAwayNum != null ? winners[m.sourceAwayNum] ?? null : null,
  ];
}

// Drop any winner that is no longer a valid candidate of its match (e.g. after an
// upstream pick changed). Iterates to a fixed point.
export function normalizeWinners(winners: Record<number, string>, rounds: Round[]): Record<number, string> {
  let next = { ...winners };
  for (let pass = 0; pass < rounds.length; pass++) {
    let changed = false;
    for (const r of rounds) {
      for (const m of r.matches) {
        const w = next[m.number];
        if (!w) continue;
        const [h, a] = candidates(m, next);
        if (w !== h && w !== a) {
          delete next[m.number];
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return next;
}

// Winners-per-match -> our round-set bracket picks.
export function deriveRoundPicks(
  winners: Record<number, string>,
  rounds: Round[],
): Record<string, string[]> {
  const winnersOf = (stage: KoStage) =>
    (rounds.find((r) => r.stage === stage)?.matches ?? [])
      .map((m) => winners[m.number])
      .filter((x): x is string => Boolean(x));
  return {
    R16: winnersOf("R32"),
    QF: winnersOf("R16"),
    SF: winnersOf("QF"),
    FINAL: winnersOf("SF"),
    CHAMPION: winnersOf("FINAL"),
  };
}

// Saved round-set picks -> winners-per-match (top-down: at each match, the
// candidate that the player advanced into the next round is the winner).
export function reconstructWinners(
  saved: Record<string, string[]>,
  rounds: Round[],
): Record<number, string> {
  const winners: Record<number, string> = {};
  for (const r of rounds) {
    const target = new Set(saved[ADVANCES_TO[r.stage]] ?? []);
    for (const m of r.matches) {
      const [h, a] = candidates(m, winners);
      if (h && target.has(h)) winners[m.number] = h;
      else if (a && target.has(a)) winners[m.number] = a;
    }
  }
  return winners;
}
