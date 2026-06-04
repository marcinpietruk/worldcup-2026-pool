import { prisma } from "./prisma";
import type { Settings } from "@prisma/client";

// The Settings table holds a single row (id = 1) with all editable scoring config.
export async function getSettings(): Promise<Settings> {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: 1 } });
}
