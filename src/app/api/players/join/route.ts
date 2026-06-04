import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, serverError } from "@/lib/http";
import { isRateLimited, recordFailure, clearFailures } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(40),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

// Join (create) or sign in (existing name + matching PIN). No real auth — the PIN
// only stops casual editing of someone else's picks.
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    const { name, pin } = parsed.data;
    const nameKey = name.toLowerCase();

    const rlKey = `join:${nameKey}`;
    if (isRateLimited(rlKey)) return bad("Too many attempts — wait a few minutes.", 429);

    const existing = await prisma.player.findUnique({ where: { nameKey } });
    if (existing) {
      const okPin = await bcrypt.compare(pin, existing.pinHash);
      if (!okPin) {
        recordFailure(rlKey);
        return bad("That name is taken — wrong PIN.", 401);
      }
      clearFailures(rlKey);
      return ok({ id: existing.id, name: existing.name, returning: true });
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const player = await prisma.player.create({ data: { name, nameKey, pinHash } });
    return ok({ id: player.id, name: player.name, returning: false });
  } catch (e) {
    return serverError(e);
  }
}
