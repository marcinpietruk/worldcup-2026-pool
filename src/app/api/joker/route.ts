import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { verifyPin } from "@/lib/auth";
import { isMatchLocked, recomputeAll } from "@/lib/scoring";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const schema = z.object({
  playerId: z.string().min(1),
  pin: z.string().min(1),
  matchId: z.string().nullable(), // null clears the joker
});

// Set (or clear) the player's joker match. Can't be changed once your current
// joker has kicked off, and you can't joker a match that has already started.
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    const { playerId, pin, matchId } = parsed.data;

    const auth = await verifyPin(playerId, pin);
    if (!auth.ok) return bad(auth.error, auth.status);

    if (auth.player.jokerMatchId) {
      const current = await prisma.match.findUnique({ where: { id: auth.player.jokerMatchId } });
      if (current && isMatchLocked(current)) {
        return bad("Your joker is locked in — that match has already kicked off.", 403);
      }
    }
    if (matchId) {
      const m = await prisma.match.findUnique({ where: { id: matchId } });
      if (!m) return bad("Match not found.", 404);
      if (isMatchLocked(m)) return bad("That match has already kicked off.", 403);
    }

    await prisma.player.update({ where: { id: playerId }, data: { jokerMatchId: matchId } });
    await recomputeAll();
    log.info("joker.set", { playerId, matchId });
    return ok({ jokerMatchId: matchId });
  } catch (e) {
    return serverError(e);
  }
}
