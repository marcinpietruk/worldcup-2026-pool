import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { serializeMatch } from "@/lib/serialize";
import { isMatchLocked } from "@/lib/scoring";

export const dynamic = "force-dynamic";

// Match detail. Everyone's predictions are revealed ONLY once the match has
// kicked off (locked) — before that, picks stay private.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        homeTeam: true,
        awayTeam: true,
        predictions: { include: { player: { select: { id: true, name: true } } } },
        comments: { include: { player: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!match) return bad("Match not found.", 404);

    // Reveal once predictions are closed: kickoff passed, or the match is
    // already live/finished.
    const revealed = isMatchLocked(match) || match.status !== "SCHEDULED";
    const picks = revealed
      ? match.predictions
          .map((p) => ({
            playerId: p.playerId,
            player: p.player.name,
            homeScore: p.homeScore,
            awayScore: p.awayScore,
            points: p.points,
          }))
          .sort((a, b) => b.points - a.points || a.player.localeCompare(b.player))
      : null;

    const comments = match.comments.map((c) => ({
      id: c.id,
      playerId: c.playerId,
      player: c.player.name,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    }));

    return ok({ match: serializeMatch(match), revealed, picks, predictionCount: match.predictions.length, comments });
  } catch (e) {
    return serverError(e);
  }
}
