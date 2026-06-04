import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { verifyPin } from "@/lib/auth";
import { isMatchLocked, recomputeAll } from "@/lib/scoring";
import { jokerRoundOf } from "@/lib/jokers";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const schema = z.object({
  playerId: z.string().min(1),
  pin: z.string().min(1),
  matchId: z.string().min(1),
});

// Toggle the joker for the match's round. One joker per round (group matchday or
// knockout stage up to the semis). Re-selecting the same match clears it.
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    const { playerId, pin, matchId } = parsed.data;

    const auth = await verifyPin(playerId, pin);
    if (!auth.ok) return bad(auth.error, auth.status);

    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) return bad("Match not found.", 404);
    const round = jokerRoundOf(match);
    if (!round) return bad("This match can't be jokered.", 400);

    const existing = await prisma.joker.findUnique({ where: { playerId_round: { playerId, round } } });

    if (existing && existing.matchId === matchId) {
      // Toggle off — unless it's already kicked off.
      if (isMatchLocked(match)) return bad("That match has kicked off — joker is locked in.", 403);
      await prisma.joker.delete({ where: { id: existing.id } });
    } else {
      if (isMatchLocked(match)) return bad("That match has already kicked off.", 403);
      if (existing) {
        const cur = await prisma.match.findUnique({ where: { id: existing.matchId } });
        if (cur && isMatchLocked(cur)) return bad("Your joker for this round is locked in.", 403);
      }
      await prisma.joker.upsert({
        where: { playerId_round: { playerId, round } },
        update: { matchId },
        create: { playerId, round, matchId },
      });
    }

    await recomputeAll();
    log.info("joker.set", { playerId, round, matchId });
    const jokers = await prisma.joker.findMany({ where: { playerId }, select: { matchId: true } });
    return ok({ jokerMatchIds: jokers.map((j) => j.matchId) });
  } catch (e) {
    return serverError(e);
  }
}
