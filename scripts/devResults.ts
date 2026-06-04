// DEV ONLY: simulate results so scoring/leaderboard can be verified without the
// live API. Usage:
//   npm run dev:results          -> finish all group matches (deterministic)
//   npm run dev:results all      -> also play out a full knockout bracket
//   npm run db:reset             -> clear all scores back to SCHEDULED
import { prisma } from "../src/lib/prisma";
import { recomputeAll } from "../src/lib/scoring";
import { getSettings } from "../src/lib/settings";
import type { Stage } from "@prisma/client";

// Tiny deterministic PRNG so runs are repeatable.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const goals = () => Math.floor(rnd() * 4); // 0..3

async function reset() {
  await prisma.match.updateMany({
    data: { status: "SCHEDULED", homeScore: null, awayScore: null },
  });
  // Clear knockout team assignments (placeholders only).
  await prisma.match.updateMany({
    where: { stage: { not: "GROUP" } },
    data: { homeTeamId: null, awayTeamId: null },
  });
  const s = await getSettings();
  await prisma.settings.update({ where: { id: s.id }, data: { actualGoldenBoot: null } });
  await recomputeAll();
  console.log("Reset all results.");
}

async function finishGroups() {
  const matches = await prisma.match.findMany({ where: { stage: "GROUP" } });
  for (const m of matches) {
    await prisma.match.update({
      where: { id: m.id },
      data: { status: "FINISHED", homeScore: goals(), awayScore: goals() },
    });
  }
  console.log(`Finished ${matches.length} group matches.`);
}

const KO_ORDER: Stage[] = ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"];

async function finishKnockouts() {
  const allTeams = await prisma.team.findMany();
  // Deterministic shuffle of teams.
  const pool = [...allTeams].sort(() => rnd() - 0.5);
  let advancers = pool.slice(0, 32).map((t) => t.id); // 32 into the R32

  for (const stage of KO_ORDER) {
    const matches = await prisma.match.findMany({
      where: { stage },
      orderBy: { kickoff: "asc" },
    });
    if (matches.length === 0) continue;

    // THIRD_PLACE is a single match between the two semi-final losers; handled
    // separately so it doesn't consume the finalists.
    if (stage === "THIRD_PLACE") {
      const losers = (await prisma.match.findMany({ where: { stage: "SF" } }))
        .map((m) => (m.homeScore! >= m.awayScore! ? m.awayTeamId : m.homeTeamId))
        .filter(Boolean) as string[];
      const m = matches[0];
      const hs = goals();
      let as = goals();
      if (hs === as) as = hs + 1;
      await prisma.match.update({
        where: { id: m.id },
        data: { status: "FINISHED", homeTeamId: losers[0], awayTeamId: losers[1], homeScore: hs, awayScore: as },
      });
      continue;
    }

    const winners: string[] = [];
    for (let i = 0; i < matches.length; i++) {
      const home = advancers[i * 2];
      const away = advancers[i * 2 + 1];
      const hs = goals();
      let as = goals();
      if (hs === as) as = hs + 1; // no draws in knockouts
      const homeWon = hs > as;
      winners.push(homeWon ? home : away);
      await prisma.match.update({
        where: { id: matches[i].id },
        data: { status: "FINISHED", homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as },
      });
    }
    advancers = winners;
  }

  // Set a golden-boot winner for bonus scoring.
  const s = await getSettings();
  const someTeam = allTeams[0]?.name ?? "Unknown";
  await prisma.settings.update({
    where: { id: s.id },
    data: { actualGoldenBoot: `Star Player (${someTeam})` },
  });
  console.log("Played out the full knockout bracket.");
}

async function main() {
  const mode = process.argv[2] ?? "groups";
  if (mode === "reset") {
    await reset();
  } else if (mode === "all") {
    await finishGroups();
    await finishKnockouts();
    await recomputeAll();
    console.log("Recomputed all points.");
  } else {
    await finishGroups();
    await recomputeAll();
    console.log("Recomputed all points.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
