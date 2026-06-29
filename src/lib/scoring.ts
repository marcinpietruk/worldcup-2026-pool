import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { computeBadges, type Badge } from "./achievements";
import type { Match, Prediction, Settings } from "@prisma/client";

// ---------------------------------------------------------------------------
// Locking — enforced on the server. A prediction can't be made/edited once its
// match has kicked off; bracket & bonus picks lock at the tournament's first
// kickoff.
// ---------------------------------------------------------------------------

export function isMatchLocked(match: Pick<Match, "kickoff">, now = new Date()): boolean {
  return now.getTime() >= new Date(match.kickoff).getTime();
}

// Tournament bonus picks (champion / runner-up / golden boot) stay editable
// through the tournament and lock when the FINAL kicks off — so they can be
// adjusted as the field narrows, but not once the decisive match is under way
// (which would let someone name the actual winner for free points).
export async function isBonusLocked(now = new Date()): Promise<boolean> {
  const final = await prisma.match.findFirst({
    where: { stage: "FINAL" },
    select: { kickoff: true },
  });
  return final ? now.getTime() >= final.kickoff.getTime() : false;
}

export type BracketStatus = "PENDING_GROUPS" | "OPEN";

// Bracket advancement picks open once the group stage is over (so you choose
// knockout teams knowing who qualified). From then on the board behaves like the
// group stage: each tie stays editable until its OWN kickoff (enforced per-match,
// client- and server-side). There is no global close at the first knockout.
export function bracketWindow(
  settings: Pick<Settings, "groupStageEnd">,
  now = new Date(),
): { open: boolean; status: BracketStatus } {
  const t = now.getTime();
  const end = settings.groupStageEnd ? new Date(settings.groupStageEnd).getTime() : null;
  if (end != null && t < end) return { open: false, status: "PENDING_GROUPS" };
  return { open: true, status: "OPEN" };
}

// ---------------------------------------------------------------------------
// Match scoring — Classic 3/1.
// ---------------------------------------------------------------------------

export function pointsForPrediction(
  pred: Pick<Prediction, "homeScore" | "awayScore">,
  match: Pick<Match, "homeScore" | "awayScore" | "status">,
  settings: Pick<Settings, "pointsExact" | "pointsResult">,
): number {
  if (match.status !== "FINISHED" || match.homeScore == null || match.awayScore == null) {
    return 0;
  }
  const exact = pred.homeScore === match.homeScore && pred.awayScore === match.awayScore;
  if (exact) return settings.pointsExact;
  const predResult = Math.sign(pred.homeScore - pred.awayScore);
  const actualResult = Math.sign(match.homeScore - match.awayScore);
  if (predResult === actualResult) return settings.pointsResult;
  return 0;
}

// ---------------------------------------------------------------------------
// Full recompute. Cheap at office scale (≤ ~10 players × 104 matches), and
// being fully idempotent keeps scoring provably correct after any result
// change — whether from the live sync or a manual admin override.
// ---------------------------------------------------------------------------

// Serialize recomputes within the process so a live sync and an admin override
// can't interleave partial writes. (Single-instance assumption — fine for an
// office-scale deploy; a multi-instance deploy would want a DB advisory lock.)
let recomputeChain: Promise<void> = Promise.resolve();

export function recomputeAll(): Promise<void> {
  recomputeChain = recomputeChain.catch(() => {}).then(doRecomputeAll);
  return recomputeChain;
}

async function doRecomputeAll(): Promise<void> {
  const settings = await getSettings();
  await recomputeMatchPoints(settings);
  await recomputeBonusPoints(settings);
}

async function recomputeMatchPoints(settings: Settings): Promise<void> {
  const [predictions, jokers] = await Promise.all([
    prisma.prediction.findMany({ include: { match: true } }),
    prisma.joker.findMany({ select: { playerId: true, matchId: true } }),
  ]);
  // Each (player, match) that has been jokered.
  const jokered = new Set(jokers.map((j) => `${j.playerId}:${j.matchId}`));

  for (const p of predictions) {
    let points = pointsForPrediction(p, p.match, settings);
    // Joker: double a winning pick, but take a penalty on a finished flop.
    if (jokered.has(`${p.playerId}:${p.matchId}`)) {
      if (points > 0) points *= settings.jokerMultiplier;
      else if (p.match.status === "FINISHED") points = -settings.jokerPenalty;
    }
    if (points !== p.points) {
      await prisma.prediction.update({ where: { id: p.id }, data: { points } });
    }
  }
}

// Winner / loser of the final, once it has finished.
async function finalOutcome(): Promise<{ champion?: string; runnerUp?: string }> {
  const final = await prisma.match.findFirst({ where: { stage: "FINAL" } });
  if (!final || final.status !== "FINISHED" || !final.homeTeamId || !final.awayTeamId) return {};
  // Prefer the explicit winner (covers penalty shootouts, where the fullTime
  // score is a draw); fall back to the scoreline.
  let champion = final.winnerTeamId ?? null;
  if (
    !champion &&
    final.homeScore != null &&
    final.awayScore != null &&
    final.homeScore !== final.awayScore
  ) {
    champion = final.homeScore > final.awayScore ? final.homeTeamId : final.awayTeamId;
  }
  if (!champion) return {};
  const runnerUp = champion === final.homeTeamId ? final.awayTeamId : final.homeTeamId;
  return { champion, runnerUp };
}

async function recomputeBonusPoints(settings: Settings): Promise<void> {
  const { champion, runnerUp } = await finalOutcome();
  const actualBoot = settings.actualGoldenBoot?.trim().toLowerCase() || null;

  const rows = await prisma.bonusPrediction.findMany();
  for (const row of rows) {
    const championPoints =
      champion && row.championTeamId === champion ? settings.bonusTournamentChampion : 0;
    const runnerUpPoints =
      runnerUp && row.runnerUpTeamId === runnerUp ? settings.bonusRunnerUp : 0;
    const goldenBootPoints =
      actualBoot && row.goldenBoot?.trim().toLowerCase() === actualBoot
        ? settings.bonusGoldenBoot
        : 0;
    if (
      championPoints !== row.championPoints ||
      runnerUpPoints !== row.runnerUpPoints ||
      goldenBootPoints !== row.goldenBootPoints
    ) {
      await prisma.bonusPrediction.update({
        where: { id: row.id },
        data: { championPoints, runnerUpPoints, goldenBootPoints },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Leaderboard.
// ---------------------------------------------------------------------------

export type LeaderboardRow = {
  playerId: string;
  name: string;
  total: number;
  matchPoints: number;
  bonusPoints: number;
  exactHits: number;
  resultHits: number;
  streak: number;
  badges: Badge[];
};

export async function buildLeaderboard(): Promise<LeaderboardRow[]> {
  const players = await prisma.player.findMany({
    include: {
      predictions: {
        select: {
          points: true,
          homeScore: true,
          awayScore: true,
          match: { select: { homeScore: true, awayScore: true, status: true, kickoff: true } },
        },
      },
      bonusPrediction: true,
    },
  });

  const rows: LeaderboardRow[] = players.map((p) => {
    const matchPoints = p.predictions.reduce((s, x) => s + x.points, 0);
    const bonusPoints = p.bonusPrediction
      ? p.bonusPrediction.championPoints +
        p.bonusPrediction.runnerUpPoints +
        p.bonusPrediction.goldenBootPoints
      : 0;
    // Classify hits from the actual result, not from point values (robust to
    // config changes and joker doubling).
    let exactHits = 0;
    let resultHits = 0;
    for (const x of p.predictions) {
      const m = x.match;
      if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) continue;
      if (x.homeScore === m.homeScore && x.awayScore === m.awayScore) exactHits++;
      else if (Math.sign(x.homeScore - x.awayScore) === Math.sign(m.homeScore - m.awayScore))
        resultHits++;
    }
    // Current streak: trailing run of correct (points > 0) finished predictions
    // in chronological order.
    const finished = p.predictions
      .filter((x) => x.match.status === "FINISHED" && x.match.homeScore != null)
      .sort((a, b) => a.match.kickoff.getTime() - b.match.kickoff.getTime());
    let streak = 0;
    for (const x of finished) streak = x.points > 0 ? streak + 1 : 0;
    return {
      playerId: p.id,
      name: p.name,
      total: matchPoints + bonusPoints,
      matchPoints,
      bonusPoints,
      exactHits,
      resultHits,
      streak,
      badges: [] as Badge[],
    };
  });

  // Tie-breaker: total, then most exact scores, then most correct results, then name.
  rows.sort(
    (a, b) =>
      b.total - a.total ||
      b.exactHits - a.exactHits ||
      b.resultHits - a.resultHits ||
      a.name.localeCompare(b.name),
  );
  // Badges depend on final rank, so compute after sorting.
  rows.forEach((r, i) => {
    r.badges = computeBadges(r, i);
  });
  return rows;
}
