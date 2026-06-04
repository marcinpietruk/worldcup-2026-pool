import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Player } from "@prisma/client";
import { isRateLimited, recordFailure, clearFailures } from "./rateLimit";
import { log } from "./log";

export type PinResult =
  | { ok: true; player: Player }
  | { ok: false; status: 401 | 429; error: string };

// Verify a player's passcode, with brute-force rate limiting per player.
// Light tamper-protection (stops casual pick-editing), NOT real auth.
export async function verifyPin(playerId: string, pin: string): Promise<PinResult> {
  const key = `pin:${playerId}`;
  if (isRateLimited(key)) {
    log.warn("auth.rate_limited", { playerId });
    return { ok: false, status: 429, error: "Too many wrong passcode attempts — wait a few minutes." };
  }
  const player = playerId && pin ? await prisma.player.findUnique({ where: { id: playerId } }) : null;
  if (!player || !(await bcrypt.compare(pin, player.pinHash))) {
    recordFailure(key);
    log.warn("auth.passcode_fail", { playerId });
    return { ok: false, status: 401, error: "Wrong passcode." };
  }
  clearFailures(key);
  return { ok: true, player };
}

// Admin gate — a single shared password from the environment.
export function isAdmin(password: string | null | undefined): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected) && password === expected;
}
