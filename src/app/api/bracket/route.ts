import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { verifyPin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { bracketWindow } from "@/lib/scoring";
import type { BracketRound } from "@prisma/client";

export const dynamic = "force-dynamic";

// Max teams a player may name as reaching each round.
const LIMITS: Record<string, number> = { R16: 16, QF: 8, SF: 4, FINAL: 2, CHAMPION: 1 };

const schema = z.object({
  playerId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/),
  picks: z.object({
    R16: z.array(z.string()).max(16),
    QF: z.array(z.string()).max(8),
    SF: z.array(z.string()).max(4),
    FINAL: z.array(z.string()).max(2),
    CHAMPION: z.array(z.string()).max(1),
  }),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    const { playerId, pin, picks } = parsed.data;

    const auth = await verifyPin(playerId, pin);
    if (!auth.ok) return bad(auth.error, auth.status);

    const settings = await getSettings();
    const win = bracketWindow(settings);
    if (!win.open) {
      return bad(
        win.status === "PENDING_GROUPS"
          ? "The bracket opens once the group stage is over."
          : "Bracket picks are locked — the knockout stage has started.",
        403,
      );
    }

    // Validate team ids exist.
    const allIds = [...new Set(Object.values(picks).flat())];
    if (allIds.length) {
      const count = await prisma.team.count({ where: { id: { in: allIds } } });
      if (count !== allIds.length) return bad("One or more teams are invalid.");
    }

    // Replace this player's bracket picks atomically.
    await prisma.$transaction([
      prisma.bracketPrediction.deleteMany({ where: { playerId } }),
      ...Object.entries(picks).flatMap(([round, ids]) =>
        [...new Set(ids as string[])].slice(0, LIMITS[round]).map((teamId) =>
          prisma.bracketPrediction.create({
            data: { playerId, round: round as BracketRound, teamId },
          }),
        ),
      ),
    ]);

    return ok({ saved: true });
  } catch (e) {
    return serverError(e);
  }
}
