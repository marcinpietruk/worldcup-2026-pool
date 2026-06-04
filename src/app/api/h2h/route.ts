import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

function loadPlayer(id: string) {
  return prisma.player.findUnique({
    where: { id },
    include: {
      predictions: { include: { match: { include: { homeTeam: true, awayTeam: true } } } },
    },
  });
}

// Head-to-head: compare two players across the matches they both predicted that
// are now finished (results already public, so no privacy leak).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const aId = url.searchParams.get("a");
    const bId = url.searchParams.get("b");
    const players = await prisma.player.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

    if (!aId || !bId || aId === bId) return ok({ players, comparison: null });

    const [a, b] = await Promise.all([loadPlayer(aId), loadPlayer(bId)]);
    if (!a || !b) return bad("Player not found.", 404);

    const bByMatch = new Map(b.predictions.map((p) => [p.matchId, p]));
    const rows: unknown[] = [];
    let aPts = 0, bPts = 0;
    const tally = { a: 0, b: 0, tie: 0 };

    for (const pa of a.predictions.sort((x, y) => x.match.kickoff.getTime() - y.match.kickoff.getTime())) {
      const pb = bByMatch.get(pa.matchId);
      const m = pa.match;
      if (!pb || m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) continue;
      aPts += pa.points;
      bPts += pb.points;
      if (pa.points > pb.points) tally.a++;
      else if (pb.points > pa.points) tally.b++;
      else tally.tie++;
      rows.push({
        match: `${m.homeTeam?.name ?? m.homeLabel ?? "?"} v ${m.awayTeam?.name ?? m.awayLabel ?? "?"}`,
        result: `${m.homeScore}-${m.awayScore}`,
        aPick: `${pa.homeScore}-${pa.awayScore}`,
        aPts: pa.points,
        bPick: `${pb.homeScore}-${pb.awayScore}`,
        bPts: pb.points,
        winner: pa.points > pb.points ? "a" : pb.points > pa.points ? "b" : "tie",
      });
    }

    return ok({
      players,
      comparison: {
        a: { id: a.id, name: a.name, points: aPts },
        b: { id: b.id, name: b.name, points: bPts },
        rows,
        tally,
      },
    });
  } catch (e) {
    return serverError(e);
  }
}
