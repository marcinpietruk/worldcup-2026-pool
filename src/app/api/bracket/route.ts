import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { verifyPin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { bracketWindow } from "@/lib/scoring";
import { getMatchDTOs } from "@/lib/serialize";
import { bracketRounds, reconstructWinners, normalizeWinners, deriveRoundPicks } from "@/lib/bracket";
import type { BracketRound } from "@prisma/client";

export const dynamic = "force-dynamic";

// Max teams a player may name as reaching each round.
const LIMITS: Record<string, number> = { R16: 16, QF: 8, SF: 4, FINAL: 2, CHAMPION: 1 };
const ROUNDS = ["R16", "QF", "SF", "FINAL", "CHAMPION"] as const;
const emptySets = (): Record<string, string[]> => ({ R16: [], QF: [], SF: [], FINAL: [], CHAMPION: [] });

const schema = z.object({
  playerId: z.string().min(1),
  pin: z.string().min(1),
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
    if (!bracketWindow(settings).open) {
      return bad("The bracket opens once the group stage is over.", 403);
    }

    // Validate team ids exist.
    const allIds = [...new Set(Object.values(picks).flat())];
    if (allIds.length) {
      const count = await prisma.team.count({ where: { id: { in: allIds } } });
      if (count !== allIds.length) return bad("One or more teams are invalid.");
    }

    // Per-tie locking, like the group stage: a tie's "who advances" pick freezes
    // at its OWN kickoff. Rebuild the bracket from the player's *existing* picks
    // for any tie that has kicked off, and from the *incoming* picks otherwise, so
    // a started tie can't be rewritten even via a hand-crafted request.
    const now = new Date();
    const rounds = bracketRounds(await getMatchDTOs(now));
    const existingRows = await prisma.bracketPrediction.findMany({ where: { playerId } });
    const existingSets = emptySets();
    for (const r of existingRows) existingSets[r.round]?.push(r.teamId);

    const existingWinners = reconstructWinners(existingSets, rounds);
    const incomingWinners = reconstructWinners(picks, rounds);
    const merged: Record<number, string> = {};
    for (const round of rounds) {
      for (const m of round.matches) {
        const winner = m.locked ? existingWinners[m.number] : incomingWinners[m.number];
        if (winner) merged[m.number] = winner;
      }
    }
    const finalPicks = deriveRoundPicks(normalizeWinners(merged, rounds), rounds);

    // Replace this player's bracket picks atomically.
    await prisma.$transaction([
      prisma.bracketPrediction.deleteMany({ where: { playerId } }),
      ...ROUNDS.flatMap((round) =>
        [...new Set(finalPicks[round] ?? [])].slice(0, LIMITS[round]).map((teamId) =>
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
