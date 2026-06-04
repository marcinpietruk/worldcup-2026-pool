import { canonicalTeamName } from "../teams";
import { mapStage, parseKickoffUtc, type NormalizedFixture } from "./fixtures";
// Imported (not fs-read) so the snapshot is bundled into the serverless function
// on Vercel — otherwise production seeding can't find the file.
import snapshot from "../../../data/worldcup2026.json";

type RawMatch = {
  round: string;
  date: string;
  time?: string;
  team1: string;
  team2: string;
  group?: string;
  ground?: string;
};

// Normalize the bundled openfootball snapshot (no network / no API key required)
// into our fixture shape. This is the canonical fixture list.
export function loadCanonicalFixtures(): NormalizedFixture[] {
  const raw = snapshot as { matches: RawMatch[] };

  const fixtures: NormalizedFixture[] = raw.matches.map((m, i) => {
    const stage = mapStage(m.round);
    const group = m.group ? m.group.replace(/^Group\s+/i, "").trim() || null : null;
    const isGroup = stage === "GROUP";
    return {
      externalId: `wc26-${String(i).padStart(3, "0")}`,
      stage,
      group: isGroup ? group : null,
      matchday: null, // assigned per-group during seed
      kickoff: parseKickoffUtc(m.date, m.time),
      homeName: isGroup ? canonicalTeamName(m.team1) : null,
      awayName: isGroup ? canonicalTeamName(m.team2) : null,
      homeLabel: isGroup ? null : m.team1, // e.g. "2A", "W74"
      awayLabel: isGroup ? null : m.team2,
      homeScore: null,
      awayScore: null,
      winner: null,
      status: "SCHEDULED",
    };
  });

  // Assign per-group matchday 1..3 by kickoff order, for tidy display.
  const byGroup = new Map<string, NormalizedFixture[]>();
  for (const f of fixtures) {
    if (f.stage === "GROUP" && f.group) {
      const arr = byGroup.get(f.group) ?? [];
      arr.push(f);
      byGroup.set(f.group, arr);
    }
  }
  for (const arr of byGroup.values()) {
    arr.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
    // Each group has 6 matches across 3 matchdays (2 per matchday).
    arr.forEach((f, idx) => {
      f.matchday = Math.floor(idx / 2) + 1;
    });
  }

  return fixtures;
}
