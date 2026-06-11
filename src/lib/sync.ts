import { prisma } from "./prisma";
import { getLiveProvider } from "./providers";
import { recomputeAll } from "./scoring";
import { log } from "./log";
import { flagFor, fifaCodeFor } from "./teams";
import type { NormalizedFixture } from "./providers/fixtures";
import type { Match, Stage } from "@prisma/client";

export type SyncResult = {
  skipped?: boolean;
  reason?: string;
  provider?: string;
  fetched?: number; // fixtures returned by the provider
  matched?: number; // fixtures successfully mapped onto our DB matches
  updated: number; // matches whose score/status/teams actually changed
  resolvedTeams: number;
};

// Unordered key for a group match: group + the two team names sorted.
function groupKey(group: string | null, a: string | null, b: string | null): string | null {
  if (!group || !a || !b) return null;
  return `${group}|${[a, b].sort().join("~")}`;
}

// Unordered key from the team pair alone. A pairing is unique within the group
// stage, so this matches even when a provider (e.g. ESPN) omits the group letter.
function pairKey(a: string | null, b: string | null): string | null {
  if (!a || !b) return null;
  return [a, b].sort().join("~");
}

async function getOrCreateTeamByName(
  name: string,
  cache: Map<string, string>,
): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;
  const existing = await prisma.team.findFirst({ where: { name } });
  if (existing) {
    cache.set(name, existing.id);
    return existing.id;
  }
  // Knockout team not seen in the group seed (rare). Create without a code to
  // avoid colliding with the unique code constraint.
  const created = await prisma.team.create({
    data: { name, flag: flagFor(name), code: null },
  });
  cache.set(name, created.id);
  return created.id;
}

// Pull live fixtures and update our matches' scores/status (and resolve knockout
// teams), then recompute all points. Safe to call repeatedly.
export async function syncLiveResults(): Promise<SyncResult> {
  const provider = getLiveProvider();
  if (!provider) {
    return { skipped: true, reason: "no live provider configured", updated: 0, resolvedTeams: 0 };
  }

  const live = await provider.fetchLiveFixtures();
  const dbMatches = await prisma.match.findMany();
  const teamCache = new Map<string, string>();
  // Preload existing teams into the cache.
  for (const t of await prisma.team.findMany()) teamCache.set(t.name, t.id);

  // Group-stage matches indexed two ways: by group+pair (preferred), and by team
  // pair alone (fallback for providers like ESPN that don't expose the group).
  const dbGroupByKey = new Map<string, Match>();
  const dbGroupByPair = new Map<string, Match>();
  for (const m of dbMatches) {
    if (m.stage !== "GROUP") continue;
    const home = teamNameById(teamCache, m.homeTeamId);
    const away = teamNameById(teamCache, m.awayTeamId);
    const key = groupKey(m.group, home, away);
    if (key) dbGroupByKey.set(key, m);
    const pk = pairKey(home, away);
    if (pk) dbGroupByPair.set(pk, m);
  }

  // Knockout matches grouped by stage, sorted by kickoff (align with API by order).
  const dbKnockoutByStage = new Map<Stage, Match[]>();
  for (const m of dbMatches) {
    if (m.stage === "GROUP") continue;
    const arr = dbKnockoutByStage.get(m.stage) ?? [];
    arr.push(m);
    dbKnockoutByStage.set(m.stage, arr);
  }
  for (const arr of dbKnockoutByStage.values()) {
    arr.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  }
  const liveKnockoutByStage = new Map<Stage, NormalizedFixture[]>();
  for (const f of live) {
    if (f.stage === "GROUP") continue;
    const arr = liveKnockoutByStage.get(f.stage) ?? [];
    arr.push(f);
    liveKnockoutByStage.set(f.stage, arr);
  }
  for (const arr of liveKnockoutByStage.values()) {
    arr.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  }

  let updated = 0;
  let matched = 0;
  let resolvedTeams = 0;

  // 1. Group matches — match on group + team pair. The seeded home/away sides are
  // kept; provider scores are oriented onto them by team identity so a reversed
  // home/away from the provider can never swap the scoreline.
  for (const f of live) {
    if (f.stage !== "GROUP") continue;
    const key = groupKey(f.group, f.homeName, f.awayName);
    // Prefer group+pair; fall back to the team pair when the provider omits group.
    const target =
      (key ? dbGroupByKey.get(key) : undefined) ??
      dbGroupByPair.get(pairKey(f.homeName, f.awayName) ?? "");
    if (!target) continue;
    matched++;
    const provHomeId = f.homeName ? teamCache.get(f.homeName) ?? null : null;
    const provAwayId = f.awayName ? teamCache.get(f.awayName) ?? null : null;
    const swapped = provHomeId !== null && provHomeId === target.awayTeamId;
    if (
      await writeMatch(target, {
        status: f.status,
        homeScore: swapped ? f.awayScore : f.homeScore,
        awayScore: swapped ? f.homeScore : f.awayScore,
        homeTeamId: target.homeTeamId,
        awayTeamId: target.awayTeamId,
        winnerTeamId: f.winner === "HOME" ? provHomeId : f.winner === "AWAY" ? provAwayId : null,
        kickoff: f.kickoff,
        statusDetail: f.statusDetail ?? null,
      })
    )
      updated++;
  }

  // 2. Knockout matches — align same-stage fixtures by kickoff order. Teams come
  // from the provider, so scores and winner map directly onto its orientation.
  for (const [stage, liveArr] of liveKnockoutByStage) {
    const dbArr = dbKnockoutByStage.get(stage);
    if (!dbArr || dbArr.length !== liveArr.length) continue; // counts differ → skip stage
    for (let i = 0; i < dbArr.length; i++) {
      const target = dbArr[i];
      const f = liveArr[i];
      matched++;
      let homeTeamId = target.homeTeamId;
      let awayTeamId = target.awayTeamId;
      if (f.homeName && !homeTeamId) {
        homeTeamId = await getOrCreateTeamByName(f.homeName, teamCache);
        resolvedTeams++;
      }
      if (f.awayName && !awayTeamId) {
        awayTeamId = await getOrCreateTeamByName(f.awayName, teamCache);
        resolvedTeams++;
      }
      if (
        await writeMatch(target, {
          status: f.status,
          homeScore: f.homeScore,
          awayScore: f.awayScore,
          homeTeamId,
          awayTeamId,
          winnerTeamId: f.winner === "HOME" ? homeTeamId : f.winner === "AWAY" ? awayTeamId : null,
          kickoff: f.kickoff,
          statusDetail: f.statusDetail ?? null,
        })
      )
        updated++;
    }
  }

  await recomputeAll();
  const result = { provider: provider.name, fetched: live.length, matched, updated, resolvedTeams };
  log.info("sync.complete", result);
  return result;
}

function teamNameById(cache: Map<string, string>, id: string | null): string | null {
  if (!id) return null;
  for (const [name, tid] of cache) if (tid === id) return name;
  return null;
}

type MatchPatch = {
  status: Match["status"];
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerTeamId: string | null;
  kickoff: Date;
  statusDetail: string | null;
};

// Write a patch onto a match, only if something actually changed (so unchanged
// fixtures don't trigger needless writes/recomputes).
async function writeMatch(match: Match, patch: MatchPatch): Promise<boolean> {
  const changed =
    patch.status !== match.status ||
    patch.homeScore !== match.homeScore ||
    patch.awayScore !== match.awayScore ||
    patch.homeTeamId !== match.homeTeamId ||
    patch.awayTeamId !== match.awayTeamId ||
    patch.winnerTeamId !== match.winnerTeamId ||
    patch.statusDetail !== match.statusDetail ||
    patch.kickoff.getTime() !== match.kickoff.getTime();
  if (!changed) return false;
  await prisma.match.update({ where: { id: match.id }, data: patch });
  return true;
}
