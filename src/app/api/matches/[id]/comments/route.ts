import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { verifyPin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  playerId: z.string().min(1),
  pin: z.string().min(1),
  body: z.string().trim().min(1, "Say something").max(280),
});

// Post a comment ("trash talk") to a match thread. PIN-gated.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    const { playerId, pin, body } = parsed.data;

    const auth = await verifyPin(playerId, pin);
    if (!auth.ok) return bad(auth.error, auth.status);

    const match = await prisma.match.findUnique({ where: { id }, select: { id: true } });
    if (!match) return bad("Match not found.", 404);

    const c = await prisma.comment.create({ data: { matchId: id, playerId, body } });
    return ok({ id: c.id });
  } catch (e) {
    return serverError(e);
  }
}
