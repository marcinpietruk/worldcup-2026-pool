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

// Order each knockout round so the tree lines up: R32 by match number, then each
// later round by the position of its feeder matches in the previous round.
export function bracketRounds(matches: MatchDTO[]): Round[] {
  const byStage = (s: string) => matches.filter((m) => m.stage === s);
  let prev = byStage("R32").slice().sort((a, b) => a.number - b.number);
  const rounds: Round[] = [{ stage: "R32", matches: prev }];
  const posOf = (arr: MatchDTO[], num: number | null) => {
    const i = num == null ? -1 : arr.findIndex((m) => m.number === num);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  for (const stage of ["R16", "QF", "SF", "FINAL"] as KoStage[]) {
    const arr = byStage(stage)
      .slice()
      .sort(
        (a, b) =>
          Math.min(posOf(prev, a.sourceHomeNum), posOf(prev, a.sourceAwayNum)) -
          Math.min(posOf(prev, b.sourceHomeNum), posOf(prev, b.sourceAwayNum)),
      );
    rounds.push({ stage, matches: arr });
    prev = arr;
  }
  return rounds;
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
