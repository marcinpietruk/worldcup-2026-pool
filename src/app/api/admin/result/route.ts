import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { isAdmin } from "@/lib/auth";
import { recomputeAll } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const schema = z.object({
  password: z.string(),
  matchId: z.string().min(1),
  status: z.enum(["SCHEDULED", "LIVE", "FINISHED"]),
  homeScore: z.number().int().min(0).max(30).nullable().optional(),
  awayScore: z.number().int().min(0).max(30).nullable().optional(),
  homeTeamId: z.string().nullable().optional(),
  awayTeamId: z.string().nullable().optional(),
});

// Manual result override (and optional knockout team assignment), then recompute.
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    const { password, matchId, status, homeScore, awayScore, homeTeamId, awayTeamId } = parsed.data;
    if (!isAdmin(password)) return bad("Wrong admin password.", 401);

    const data: Record<string, unknown> = { status };
    if (homeScore !== undefined) data.homeScore = homeScore;
    if (awayScore !== undefined) data.awayScore = awayScore;
    if (homeTeamId !== undefined) data.homeTeamId = homeTeamId;
    if (awayTeamId !== undefined) data.awayTeamId = awayTeamId;

    await prisma.match.update({ where: { id: matchId }, data });
    await recomputeAll();
    return ok({ saved: true });
  } catch (e) {
    return serverError(e);
  }
}
