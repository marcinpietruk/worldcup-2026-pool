// Which "round" a match belongs to for joker purposes — one joker allowed per
// round. Group games are grouped by matchday (MD1/MD2/MD3); knockout games by
// stage up to the semis. The Final and 3rd-place playoff get no joker.
export function jokerRoundOf(m: { stage: string; matchday: number | null }): string | null {
  if (m.stage === "GROUP") return m.matchday ? `MD${m.matchday}` : null;
  if (m.stage === "R32" || m.stage === "R16" || m.stage === "QF" || m.stage === "SF") return m.stage;
  return null;
}

export const JOKER_ROUND_LABEL: Record<string, string> = {
  MD1: "Matchday 1",
  MD2: "Matchday 2",
  MD3: "Matchday 3",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
};
