import { prisma } from "./prisma";
import { loadCanonicalFixtures } from "./providers/openfootball";
import { flagFor, fifaCodeFor } from "./teams";
import { getSettings } from "./settings";

// Seed (or re-seed) the tournament structure from the bundled canonical dataset.
// Idempotent: teams are upserted by name, matches by externalId. Existing scores
// and predictions are preserved.
export async function seedDatabase(): Promise<{ teams: number; matches: number }> {
  const fixtures = loadCanonicalFixtures();

  // 1. Teams — every distinct real team appearing in the group stage.
  const groupTeams = new Map<string, string>(); // name -> group letter
  for (const f of fixtures) {
    if (f.stage === "GROUP") {
      if (f.homeName) groupTeams.set(f.homeName, f.group ?? "");
      if (f.awayName) groupTeams.set(f.awayName, f.group ?? "");
    }
  }

  const teamIdByName = new Map<string, string>();
  for (const [name, group] of groupTeams) {
    const team = await prisma.team.upsert({
      where: { code: fifaCodeFor(name) },
      update: { name, group, flag: flagFor(name) },
      create: { name, code: fifaCodeFor(name), group, flag: flagFor(name) },
    });
    teamIdByName.set(name, team.id);
  }

  // 2. Matches.
  for (const f of fixtures) {
    const homeTeamId = f.homeName ? teamIdByName.get(f.homeName) ?? null : null;
    const awayTeamId = f.awayName ? teamIdByName.get(f.awayName) ?? null : null;
    // Canonical 1-based match number (openfootball ordering), used to wire the
    // knockout bracket — labels like "W74" reference match #74.
    const number = parseInt(f.externalId.replace("wc26-", ""), 10) + 1;
    const base = {
      stage: f.stage,
      number,
      group: f.group,
      matchday: f.matchday,
      kickoff: f.kickoff,
      homeTeamId,
      awayTeamId,
      homeLabel: f.homeLabel,
      awayLabel: f.awayLabel,
    };
    await prisma.match.upsert({
      where: { externalId: f.externalId },
      update: base, // refresh schedule/teams; never clobbers scores/status/predictions
      create: { externalId: f.externalId, status: "SCHEDULED", ...base },
    });
  }

  // 3. Key timestamps used for locking.
  const kickoffs = fixtures.map((f) => f.kickoff.getTime());
  const groupKickoffs = fixtures.filter((f) => f.stage === "GROUP").map((f) => f.kickoff.getTime());
  const knockoutKickoffs = fixtures.filter((f) => f.stage !== "GROUP").map((f) => f.kickoff.getTime());

  const tournamentStart = new Date(Math.min(...kickoffs)); // first match — bonus lock
  // Group stage "over" ≈ the last group kickoff plus ~2h (final whistle of the
  // simultaneous last-round games). The bracket opens then.
  const groupStageEnd = new Date(Math.max(...groupKickoffs) + 2 * 3600_000);
  const knockoutStart = new Date(Math.min(...knockoutKickoffs)); // bracket lock

  const settings = await getSettings();
  await prisma.settings.update({
    where: { id: settings.id },
    data: { tournamentStart, groupStageEnd, knockoutStart },
  });

  return { teams: teamIdByName.size, matches: fixtures.length };
}
