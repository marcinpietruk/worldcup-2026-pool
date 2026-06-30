import { test } from "node:test";
import assert from "node:assert/strict";
import { mapStage, parseKickoffUtc } from "../src/lib/providers/fixtures";
import { parseApiFixture } from "../src/lib/providers/apiFootball";
import { parseFdMatch } from "../src/lib/providers/footballData";
import { canonicalTeamName, normalizeTeamName, flagFor } from "../src/lib/teams";
import { pointsForPrediction, bracketWindow } from "../src/lib/scoring";
import { computeStandings } from "../src/lib/standings";
import { actualWinner, bracketRounds, candidates, deriveRoundPicks, reconstructWinners, normalizeWinners, winnersFromScores } from "../src/lib/bracket";
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

test("bracketWindow: opens after groups and stays open (per-tie locking)", () => {
  const settings = { groupStageEnd: new Date("2026-06-27T22:00:00Z") };
  // Before the group stage is over -> not fillable yet.
  let w = bracketWindow(settings, new Date("2026-06-04T00:00:00Z"));
  assert.equal(w.open, false);
  assert.equal(w.status, "PENDING_GROUPS");
  // Groups done -> open.
  w = bracketWindow(settings, new Date("2026-06-28T08:00:00Z"));
  assert.equal(w.open, true);
  assert.equal(w.status, "OPEN");
  // Knockouts under way -> still open; individual ties lock at their own kickoff.
  w = bracketWindow(settings, new Date("2026-06-29T00:00:00Z"));
  assert.equal(w.open, true);
  assert.equal(w.status, "OPEN");
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
  const team = (id: string) => ({ id, name: id, flag: null, code: null, iso2: null });
  const gm = (h: string, a: string, hs: number, as: number) =>
    ({
      id: `${h}${a}`, number: 0, stage: "GROUP", group: "A", matchday: 1, kickoff: "2026-06-11T19:00:00Z",
      status: "FINISHED", sourceHomeNum: null, sourceAwayNum: null, home: team(h), away: team(a),
      homeLabel: null, awayLabel: null, homeScore: hs, awayScore: as, winnerTeamId: null, statusDetail: null,
      events: null, venue: null, attendance: null, homeRecord: null, awayRecord: null,
      locked: true,
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
  const team = (id: string) => ({ id, name: id, flag: null, code: null, iso2: null });
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

  // Winners follow the predicted scores: higher score advances and cascades into
  // the next round, so the final's candidates resolve from the semi scores.
  const fromScores = winnersFromScores(
    { m101: { home: "2", away: "1" }, m102: { home: "0", away: "3" }, m104: { home: "1", away: "0" } },
    rounds,
  );
  assert.deepEqual(fromScores, { 101: "A", 102: "D", 104: "A" });

  // A level semi (a draw) advances no one, so the final stays unresolved even with
  // a score entered against it — there are no candidates to award it to.
  const withDraw = winnersFromScores(
    { m101: { home: "1", away: "1" }, m102: { home: "0", away: "3" }, m104: { home: "2", away: "0" } },
    rounds,
  );
  assert.deepEqual(withDraw, { 102: "D" });
});

test("candidates: the actual result fills the next round over the predicted winner", () => {
  const team = (id: string) => ({ id, name: id, flag: null, code: null, iso2: null });
  const mk = (num: number, stage: string, home: string | null, away: string | null, sh: number | null, sa: number | null): MatchDTO =>
    ({
      id: `m${num}`, number: num, stage, group: null, matchday: null, kickoff: "2026-07-01T00:00:00Z",
      status: "SCHEDULED", sourceHomeNum: sh, sourceAwayNum: sa,
      home: home ? team(home) : null, away: away ? team(away) : null,
      homeLabel: null, awayLabel: null, homeScore: null, awayScore: null, locked: false,
    }) as MatchDTO;

  // R32 #73 finished: Morocco beat Netherlands for real, so the sync seeded MAR
  // into the home slot of the R16 tie it feeds — even though this player had
  // predicted NED to win #73.
  const winners = { 73: "NED" };
  const resolved = mk(89, "R16", "MAR", null, 73, 74);
  assert.deepEqual(candidates(resolved, winners), ["MAR", null]); // real team wins the slot

  // A sibling R16 tie whose feeders aren't resolved yet still falls back to the
  // player's predicted winner of #73.
  const pending = mk(90, "R16", null, null, 73, 74);
  assert.deepEqual(candidates(pending, winners), ["NED", null]);
});

test("actualWinner: scoreline, penalty shootout, and unresolved ties", () => {
  const team = (id: string) => ({ id, name: id, flag: null, code: null, iso2: null });
  const mk = (status: string, home: string, away: string, hs: number | null, as: number | null, winnerTeamId: string | null): MatchDTO =>
    ({
      id: "m", number: 73, stage: "R32", group: null, matchday: null, kickoff: "2026-07-01T00:00:00Z",
      status, sourceHomeNum: null, sourceAwayNum: null, home: team(home), away: team(away),
      homeLabel: null, awayLabel: null, homeScore: hs, awayScore: as, winnerTeamId, locked: true,
    }) as MatchDTO;

  assert.equal(actualWinner(mk("FINISHED", "MAR", "NED", 1, 0, null)), "MAR"); // decided on the scoreline
  assert.equal(actualWinner(mk("FINISHED", "MAR", "NED", 1, 1, "NED")), "NED"); // shootout: level, explicit winner
  assert.equal(actualWinner(mk("FINISHED", "MAR", "NED", 1, 1, null)), null); // level, no winner recorded yet
  assert.equal(actualWinner(mk("LIVE", "MAR", "NED", 1, 0, null)), null); // not finished
});

test("bracketRounds orders columns by the tree, not by match number", () => {
  const mk = (num: number, stage: string, sh: number | null, sa: number | null): MatchDTO =>
    ({
      id: `m${num}`, number: num, stage, group: null, matchday: null, kickoff: "2026-07-01T00:00:00Z",
      status: "SCHEDULED", sourceHomeNum: sh, sourceAwayNum: sa,
      home: null, away: null, homeLabel: null, awayLabel: null, homeScore: null, awayScore: null, locked: false,
    }) as MatchDTO;
  // Real WC wiring (top of bracket): R16 #89 <- R32 74,77 ; #90 <- 73,75 ; QF <- 89,90.
  // Leaves are deliberately handed in numeric order to prove they get re-ordered.
  const matches = [
    mk(73, "R32", null, null), mk(74, "R32", null, null), mk(75, "R32", null, null), mk(77, "R32", null, null),
    mk(89, "R16", 74, 77), mk(90, "R16", 73, 75),
    mk(97, "FINAL", 89, 90), // stands in for the root in this mini tree
  ];
  const rounds = bracketRounds(matches);
  const order = (stage: string) => rounds.find((r) => r.stage === stage)!.matches.map((m) => m.number);
  assert.deepEqual(order("R32"), [74, 77, 73, 75]); // bracket-tree order, not 73,74,75,77
  assert.deepEqual(order("R16"), [89, 90]); // #89 (fed by the top two) sits above #90
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
