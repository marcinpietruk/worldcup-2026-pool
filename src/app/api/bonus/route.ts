import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { verifyPin } from "@/lib/auth";
import { isBonusLocked } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const schema = z.object({
  playerId: z.string().min(1),
  pin: z.string().min(1),
  championTeamId: z.string().nullable().optional(),
  runnerUpTeamId: z.string().nullable().optional(),
  goldenBoot: z.string().trim().max(60).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    const { playerId, pin, championTeamId, runnerUpTeamId, goldenBoot } = parsed.data;

    const auth = await verifyPin(playerId, pin);
    if (!auth.ok) return bad(auth.error, auth.status);

    if (await isBonusLocked()) return bad("Bonus picks are locked — the final has kicked off.", 403);

    if (championTeamId && runnerUpTeamId && championTeamId === runnerUpTeamId) {
      return bad("Champion and runner-up must be different teams.");
    }
    const teamIds = [championTeamId, runnerUpTeamId].filter((x): x is string => Boolean(x));
    if (teamIds.length) {
      const count = await prisma.team.count({ where: { id: { in: teamIds } } });
      if (count !== new Set(teamIds).size) return bad("One or more teams are invalid.");
    }

    const data = {
      championTeamId: championTeamId ?? null,
      runnerUpTeamId: runnerUpTeamId ?? null,
      goldenBoot: goldenBoot || null,
    };
    await prisma.bonusPrediction.upsert({
      where: { playerId },
      update: data,
      create: { playerId, ...data },
    });

    return ok({ saved: true });
  } catch (e) {
    return serverError(e);
  }
}
