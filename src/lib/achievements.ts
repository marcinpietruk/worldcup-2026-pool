// Fun, computed-on-the-fly badges. Derived purely from leaderboard aggregates so
// there's nothing extra to store — they light up as the tournament unfolds.
export type Badge = { icon: string; label: string };

type Stats = {
  total: number;
  exactHits: number;
  resultHits: number;
  bonusPoints: number;
  streak: number;
};

export function computeBadges(s: Stats, rank: number): Badge[] {
  const badges: Badge[] = [];
  if (rank === 0 && s.total > 0) badges.push({ icon: "👑", label: "Leader of the pack" });
  if (s.streak >= 3) badges.push({ icon: "🔥", label: `On a roll — ${s.streak} correct in a row` });
  if (s.exactHits >= 5) badges.push({ icon: "🎯", label: "Sniper — 5+ exact scores" });
  else if (s.exactHits >= 3) badges.push({ icon: "🎯", label: "Sharpshooter — 3+ exact scores" });
  if (s.resultHits >= 10) badges.push({ icon: "📊", label: "Mr. Consistent — 10+ correct results" });
  if (s.total >= 100) badges.push({ icon: "💯", label: "Centurion — 100+ points" });
  if (s.bonusPoints >= 10) badges.push({ icon: "🔮", label: "Oracle — nailed a bonus" });
  return badges;
}
