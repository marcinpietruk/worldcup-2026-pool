import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { verifyPin } from "@/lib/auth";
import { isMatchLocked } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const schema = z.object({
  playerId: z.string().min(1),
  pin: z.string().min(1),
  predictions: z
    .array(
      z.object({
        matchId: z.string().min(1),
        homeScore: z.number().int().min(0).max(30),
        awayScore: z.number().int().min(0).max(30),
      }),
    )
    .min(1),
});

// Batch-save score predictions. PIN-gated; matches that have kicked off are
// rejected server-side so locking can't be bypassed.
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    const { playerId, pin, predictions } = parsed.data;

    const auth = await verifyPin(playerId, pin);
    if (!auth.ok) return bad(auth.error, auth.status);

    const ids = predictions.map((p) => p.matchId);
    const matches = await prisma.match.findMany({ where: { id: { in: ids } } });
    const byId = new Map(matches.map((m) => [m.id, m]));
    const now = new Date();

    let saved = 0;
    const rejected: string[] = [];
    for (const p of predictions) {
      const match = byId.get(p.matchId);
      if (!match) {
        rejected.push(p.matchId);
        continue;
      }
      if (isMatchLocked(match, now)) {
        rejected.push(p.matchId);
        continue;
      }
      await prisma.prediction.upsert({
        where: { playerId_matchId: { playerId, matchId: p.matchId } },
        update: { homeScore: p.homeScore, awayScore: p.awayScore },
        create: { playerId, matchId: p.matchId, homeScore: p.homeScore, awayScore: p.awayScore },
      });
      saved++;
    }

    return ok({ saved, rejected });
  } catch (e) {
    return serverError(e);
  }
}
