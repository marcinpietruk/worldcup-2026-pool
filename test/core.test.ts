import { test } from "node:test";
import assert from "node:assert/strict";
import { mapStage, parseKickoffUtc } from "../src/lib/providers/fixtures";
import { parseApiFixture } from "../src/lib/providers/apiFootball";
import { parseFdMatch } from "../src/lib/providers/footballData";
import { canonicalTeamName, normalizeTeamName, flagFor } from "../src/lib/teams";
import { pointsForPrediction, bracketWindow } from "../src/lib/scoring";
import { computeStandings } from "../src/lib/standings";
import { bracketRounds, candidates, deriveRoundPicks, reconstructWinners, normalizeWinners } from "../src/lib/bracket";
import type { MatchDTO } from "../src/lib/client";

test("parseKickoffUtc converts local-with-offset to UTC", () => {
  assert.equal(
    parseKickoffUtc("2026-06-11", "13:00 UTC-6").toISOString(),
    "2026-06-11T19:00:00.000Z",
  );
  assert.equal(
    parseKickoffUtc("2026-07-19", "15:00 UTC-4").toISOString(),
    "2026-07-19T19:00:00.000Z",
  );
});

test("mapStage classifies rounds (including the 'final' traps)", () => {
  assert.equal(mapStage("Matchday 1"), "GROUP");
  assert.equal(mapStage("Group A - 1"), "GROUP");
  assert.equal(mapStage("Round of 32"), "R32");
  assert.equal(mapStage("Round of 16"), "R16");
  assert.equal(mapStage("Quarter-finals"), "QF");
  assert.equal(mapStage("Semi-finals"), "SF");
  assert.equal(mapStage("Match for third place"), "THIRD_PLACE");
  assert.equal(mapStage("3rd Place Final"), "THIRD_PLACE");
  assert.equal(mapStage("Final"), "FINAL");
});

test("team-name canonicalization handles aliases & accents", () => {
  assert.equal(canonicalTeamName("Korea Republic"), "South Korea");
  assert.equal(canonicalTeamName("Côte d'Ivoire"), "Ivory Coast");
  assert.equal(canonicalTeamName("Czechia"), "Czech Republic");
  assert.equal(canonicalTeamName("Bosnia and Herzegovina"), "Bosnia & Herzegovina");
  assert.equal(canonicalTeamName("USA"), "USA");
  assert.equal(normalizeTeamName("Côte d'Ivoire"), "cote d ivoire");
  assert.equal(flagFor("Brazil"), "🇧🇷");
});

test("parseApiFixture: group fixture", () => {
  const f = parseApiFixture({
    fixture: { id: 42, date: "2026-06-11T19:00:00+00:00", status: { short: "FT" } },
    league: { round: "Group A - 1" },
    teams: { home: { name: "Mexico" }, away: { name: "South Africa" } },
    goals: { home: 2, away: 1 },
  });
  assert.equal(f.stage, "GROUP");
  assert.equal(f.group, "A");
  assert.equal(f.matchday, 1);
  assert.equal(f.homeName, "Mexico");
  assert.equal(f.awayName, "South Africa");
  assert.equal(f.homeScore, 2);
  assert.equal(f.status, "FINISHED");
  assert.equal(f.kickoff.toISOString(), "2026-06-11T19:00:00.000Z");
});

test("parseApiFixture: knockout fixture with aliases, not started", () => {
  const f = parseApiFixture({
    fixture: { id: 200, date: "2026-07-19T19:00:00+00:00", status: { short: "NS" } },
    league: { round: "Final" },
    teams: { home: { name: "Korea Republic" }, away: { name: "Côte d'Ivoire" } },
    goals: { home: null, away: null },
  });
  assert.equal(f.stage, "FINAL");
  assert.equal(f.group, null);
  assert.equal(f.homeName, "South Korea");
  assert.equal(f.awayName, "Ivory Coast");
  assert.equal(f.homeScore, null);
  assert.equal(f.status, "SCHEDULED");
});

test("bracketWindow: opens after groups, closes at knockouts", () => {
  const settings = {
    groupStageEnd: new Date("2026-06-27T22:00:00Z"),
    knockoutStart: new Date("2026-06-28T19:00:00Z"),
  };
  // Before the group stage is over -> not fillable yet.
  let w = bracketWindow(settings, new Date("2026-06-04T00:00:00Z"));
  assert.equal(w.open, false);
  assert.equal(w.status, "PENDING_GROUPS");
  // In the window (groups done, knockouts not started) -> open.
  w = bracketWindow(settings, new Date("2026-06-28T08:00:00Z"));
  assert.equal(w.open, true);
  assert.equal(w.status, "OPEN");
  // Knockouts have started -> closed.
  w = bracketWindow(settings, new Date("2026-06-29T00:00:00Z"));
  assert.equal(w.open, false);
  assert.equal(w.status, "CLOSED");
});

test("parseFdMatch: football-data.org group + knockout", () => {
  const g = parseFdMatch({
    id: 5001,
    utcDate: "2026-06-11T19:00:00Z",
    status: "IN_PLAY",
    stage: "GROUP_STAGE",
    group: "GROUP_A",
    matchday: 1,
    homeTeam: { name: "Mexico" },
    awayTeam: { name: "South Africa" },
    score: { winner: null, fullTime: { home: 1, away: 0 } },
  });
  assert.equal(g.stage, "GROUP");
  assert.equal(g.group, "A");
  assert.equal(g.matchday, 1);
  assert.equal(g.status, "LIVE");
  assert.equal(g.homeScore, 1);
  assert.equal(g.winner, null);

  const k = parseFdMatch({
    id: 5099,
    utcDate: "2026-06-29T19:00:00Z",
    status: "TIMED",
    stage: "LAST_32",
    group: null,
    matchday: null,
    homeTeam: { name: "Korea Republic" },
    awayTeam: { name: null },
    score: { winner: null, fullTime: { home: null, away: null } },
  });
  assert.equal(k.stage, "R32");
  assert.equal(k.homeName, "South Korea");
  assert.equal(k.awayName, null);
  assert.equal(k.status, "SCHEDULED");

  // Penalty win: fullTime is a draw but winner is set.
  const pens = parseFdMatch({
    id: 5100,
    utcDate: "2026-07-19T19:00:00Z",
    status: "FINISHED",
    stage: "FINAL",
    group: null,
    matchday: null,
    homeTeam: { name: "Brazil" },
    awayTeam: { name: "France" },
    score: { winner: "AWAY_TEAM", fullTime: { home: 1, away: 1 } },
  });
  assert.equal(pens.winner, "AWAY");
  assert.equal(pens.status, "FINISHED");
});

test("computeStandings ranks a group by points then GD", () => {
  const team = (id: string) => ({ id, name: id, flag: null, code: null });
  const gm = (h: string, a: string, hs: number, as: number) =>
    ({
      id: `${h}${a}`, number: 0, stage: "GROUP", group: "A", matchday: 1, kickoff: "2026-06-11T19:00:00Z",
      status: "FINISHED", sourceHomeNum: null, sourceAwayNum: null, home: team(h), away: team(a),
      homeLabel: null, awayLabel: null, homeScore: hs, awayScore: as, locked: true,
    }) as const;
  const standings = computeStandings([gm("Alpha", "Bravo", 2, 0), gm("Charlie", "Delta", 1, 1)]);
  const groupA = standings.find((g) => g.group === "A")!;
  assert.equal(groupA.rows[0].name, "Alpha");
  assert.equal(groupA.rows[0].pts, 3);
  assert.equal(groupA.rows[0].gd, 2);
  assert.equal(groupA.rows.find((r) => r.name === "Bravo")!.pts, 0);
  assert.equal(groupA.rows.find((r) => r.name === "Charlie")!.pts, 1);
});

test("bracket: derive picks, reconstruct, and normalize", () => {
  const team = (id: string) => ({ id, name: id, flag: null, code: null });
  const mk = (num: number, stage: string, home: string | null, away: string | null, sh: number | null, sa: number | null): MatchDTO =>
    ({
      id: `m${num}`, number: num, stage, group: null, matchday: null, kickoff: "2026-07-01T00:00:00Z",
      status: "SCHEDULED", sourceHomeNum: sh, sourceAwayNum: sa,
      home: home ? team(home) : null, away: away ? team(away) : null,
      homeLabel: null, awayLabel: null, homeScore: null, awayScore: null, locked: false,
    }) as MatchDTO;

  // 4-team mini knockout: two semis feeding a final.
  const matches = [
    mk(101, "SF", "A", "B", null, null),
    mk(102, "SF", "C", "D", null, null),
    mk(104, "FINAL", null, null, 101, 102),
  ];
  const rounds = bracketRounds(matches);

  // A wins SF101, C wins SF102, A wins the final.
  const winners = { 101: "A", 102: "C", 104: "A" };
  assert.deepEqual(candidates(matches[2], winners), ["A", "C"]);
  const picks = deriveRoundPicks(winners, rounds);
  assert.deepEqual(picks.FINAL.sort(), ["A", "C"]); // SF winners reach the final
  assert.deepEqual(picks.CHAMPION, ["A"]);

  // Round-sets reconstruct back to the same per-match winners.
  const saved = { R16: [], QF: [], SF: [], FINAL: ["A", "C"], CHAMPION: ["A"] };
  assert.deepEqual(reconstructWinners(saved, rounds), { 101: "A", 102: "C", 104: "A" });

  // Flipping SF101 to B invalidates the stale final winner (A no longer a candidate).
  const flipped = normalizeWinners({ 101: "B", 102: "C", 104: "A" }, rounds);
  assert.equal(flipped[104], undefined);
});

const SETTINGS = { pointsExact: 3, pointsResult: 1 };
const finished = (h: number, a: number) =>
  ({ homeScore: h, awayScore: a, status: "FINISHED" }) as const;

test("scoring: exact / result / miss / unfinished", () => {
  // Exact score -> 3
  assert.equal(pointsForPrediction({ homeScore: 2, awayScore: 1 }, finished(2, 1), SETTINGS), 3);
  // Right result (home win), wrong score -> 1
  assert.equal(pointsForPrediction({ homeScore: 3, awayScore: 0 }, finished(2, 1), SETTINGS), 1);
  // Right result (draw), wrong score -> 1
  assert.equal(pointsForPrediction({ homeScore: 1, awayScore: 1 }, finished(2, 2), SETTINGS), 1);
  // Wrong result -> 0
  assert.equal(pointsForPrediction({ homeScore: 0, awayScore: 1 }, finished(2, 1), SETTINGS), 0);
  // Not finished -> 0
  assert.equal(
    pointsForPrediction({ homeScore: 2, awayScore: 1 }, { homeScore: null, awayScore: null, status: "SCHEDULED" }, SETTINGS),
    0,
  );
});
