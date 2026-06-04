import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { isAdmin } from "@/lib/auth";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const schema = z.object({
  password: z.string(),
  playerId: z.string().min(1),
  newPin: z.string().regex(/^[!-~]{4,20}$/, "Passcode must be 4–20 characters (no spaces)"),
});

// Admin resets a player's passcode (e.g. when they forget it).
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    const { password, playerId, newPin } = parsed.data;
    if (!isAdmin(password)) return bad("Wrong admin password.", 401);
    await prisma.player.update({ where: { id: playerId }, data: { pinHash: await bcrypt.hash(newPin, 10) } });
    log.info("admin.passcode_reset", { playerId });
    return ok({ reset: true });
  } catch (e) {
    return serverError(e);
  }
}
