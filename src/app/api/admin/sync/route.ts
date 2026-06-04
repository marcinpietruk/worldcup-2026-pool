import { z } from "zod";
import { ok, bad, serverError } from "@/lib/http";
import { isAdmin } from "@/lib/auth";
import { syncLiveResults } from "@/lib/sync";

export const dynamic = "force-dynamic";

const schema = z.object({ password: z.string() });

// Force an immediate live sync from the football API.
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad("Invalid input");
    if (!isAdmin(parsed.data.password)) return bad("Wrong admin password.", 401);
    const result = await syncLiveResults();
    return ok(result);
  } catch (e) {
    return serverError(e);
  }
}
