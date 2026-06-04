import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { isAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { recomputeAll } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const point = z.number().int().min(0).max(1000).optional();
const schema = z.object({
  password: z.string(),
  pointsExact: point,
  pointsResult: point,
  bonusR16: point,
  bonusQF: point,
  bonusSF: point,
  bonusFinal: point,
  bonusChampion: point,
  bonusTournamentChampion: point,
  bonusRunnerUp: point,
  bonusGoldenBoot: point,
  jokerMultiplier: point,
  jokerPenalty: point,
  actualGoldenBoot: z.string().trim().max(60).nullable().optional(),
  tournamentStart: z.string().datetime().nullable().optional(),
  groupStageEnd: z.string().datetime().nullable().optional(),
  knockoutStart: z.string().datetime().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    const { password, tournamentStart, groupStageEnd, knockoutStart, ...rest } = parsed.data;
    if (!isAdmin(password)) return bad("Wrong admin password.", 401);

    const settings = await getSettings();
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) data[k] = v;
    const dates = { tournamentStart, groupStageEnd, knockoutStart };
    for (const [k, v] of Object.entries(dates)) {
      if (v !== undefined) data[k] = v ? new Date(v) : null;
    }

    await prisma.settings.update({ where: { id: settings.id }, data });
    await recomputeAll();
    return ok({ saved: true });
  } catch (e) {
    return serverError(e);
  }
}
