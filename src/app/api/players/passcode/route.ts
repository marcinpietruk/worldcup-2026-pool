import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { verifyPin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  playerId: z.string().min(1),
  pin: z.string().min(1), // current passcode
  newPin: z.string().regex(/^[A-Za-z0-9]{4,20}$/, "Passcode must be 4–20 letters or numbers"),
});

// Self-service passcode change — requires the current passcode.
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    const { playerId, pin, newPin } = parsed.data;
    const auth = await verifyPin(playerId, pin);
    if (!auth.ok) return bad(auth.error, auth.status);
    await prisma.player.update({ where: { id: playerId }, data: { pinHash: await bcrypt.hash(newPin, 10) } });
    return ok({ changed: true });
  } catch (e) {
    return serverError(e);
  }
}
