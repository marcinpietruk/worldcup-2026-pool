import { z } from "zod";
import { ok, bad, serverError } from "@/lib/http";
import { isAdmin } from "@/lib/auth";
import { seedDatabase } from "@/lib/seed";

export const dynamic = "force-dynamic";

const schema = z.object({ password: z.string() });

// Seed (or refresh) the tournament structure from the bundled dataset. Used to
// populate a freshly-deployed production database.
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad("Invalid input");
    if (!isAdmin(parsed.data.password)) return bad("Wrong admin password.", 401);
    const result = await seedDatabase();
    return ok(result);
  } catch (e) {
    return serverError(e);
  }
}
