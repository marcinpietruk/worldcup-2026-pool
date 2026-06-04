import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// All players' picks, for the admin "view everyone's predictions" panel.
export async function GET(req: Request) {
  try {
    const password = new URL(req.url).searchParams.get("password");
    if (!isAdmin(password)) return bad("Wrong admin password.", 401);

    const [players, predictions, bracket, bonus] = await Promise.all([
      prisma.player.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.prediction.findMany({ include: { player: true, match: { include: { homeTeam: true, awayTeam: true } } } }),
      prisma.bracketPrediction.findMany({ include: { player: true, team: true } }),
      prisma.bonusPrediction.findMany({ include: { player: true, championTeam: true, runnerUpTeam: true } }),
    ]);

    const label = (m: (typeof predictions)[number]["match"]) =>
      `${m.homeTeam?.name ?? m.homeLabel ?? "?"} v ${m.awayTeam?.name ?? m.awayLabel ?? "?"}`;

    return ok({
      players: players.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt.toISOString() })),
      predictions: predictions.map((p) => ({
        player: p.player.name,
        matchId: p.matchId,
        match: label(p.match),
        stage: p.match.stage,
        kickoff: p.match.kickoff.toISOString(),
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        points: p.points,
      })),
      bracket: bracket.map((b) => ({
        player: b.player.name,
        round: b.round,
        team: b.team.name,
        points: b.points,
      })),
      bonus: bonus.map((b) => ({
        player: b.player.name,
        champion: b.championTeam?.name ?? null,
        runnerUp: b.runnerUpTeam?.name ?? null,
        goldenBoot: b.goldenBoot,
        points: b.championPoints + b.runnerUpPoints + b.goldenBootPoints,
      })),
    });
  } catch (e) {
    return serverError(e);
  }
}
