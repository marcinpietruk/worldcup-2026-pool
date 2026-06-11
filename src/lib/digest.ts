import { Prisma, type Match, type Team } from "@prisma/client";
import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { buildLeaderboard } from "./scoring";
import type { SlackBlock } from "./slack";

// ---------------------------------------------------------------------------
// Daily Slack digest. Gathers four sections — standings (+ day-over-day
// movement), results since the last digest, today's fixtures, and a few fun
// awards — then renders them as Slack Block Kit.
//
// "Movement" needs a baseline, so each *real* post saves a snapshot of the
// standings (Settings.digestSnapshot); the next post diffs against it. Preview
// (`?dry=1`) and quiet days don't touch the baseline.
// ---------------------------------------------------------------------------

const TZ = "Europe/Amsterdam"; // office timezone — drives "today" and clock times

// Snapshot stored in Settings.digestSnapshot between runs.
type Snapshot = {
  takenAt: string;
  ranks: Record<string, { rank: number; total: number }>;
  reportedIds?: string[]; // ids of matches already shown in a recap, so each result reports exactly once
};

type MatchT = Match & { homeTeam: Team | null; awayTeam: Team | null };

export type StandingRow = {
  rank: number; // 0-based
  name: string;
  total: number;
  matchPoints: number;
  bonusPoints: number;
  move: number; // +n = climbed n places since last digest, -n = dropped, 0 = no change/new
  streak: number;
};

export type Award = { name: string; pred: string; line: string; plain: string; pts: number };

export type DigestData = {
  now: Date;
  settingsId: number;
  hasContent: boolean; // false on a quiet day (nothing new, no games) → skip posting
  standings: StandingRow[];
  recap: MatchT[]; // matches finished since the last digest
  gainers: Array<{ name: string; pts: number; exact: number }>; // who scored in that window
  fixtures: MatchT[]; // today's not-yet-finished matches
  rounds: string[]; // joker rounds in play today (e.g. "Matchday 2")
  best: Award | null; // prediction of the day
  flop: Award | null; // flop of the day (a jokered miss)
  hottest: { name: string; streak: number } | null;
  snapshot: Snapshot; // standings captured now, to persist on a real post
};

// --- Amsterdam-local formatting (DST-safe via Intl) -------------------------

// Pretty header date, e.g. "Tue 16 Jun".
function amsPretty(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, weekday: "short", day: "2-digit", month: "short",
  }).format(d);
}
// Kickoff clock time, e.g. "21:00".
function amsTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

// --- Match helpers ----------------------------------------------------------

function side(team: Team | null, label: string | null): { name: string; flag: string } {
  return { name: team?.name ?? label ?? "TBD", flag: team?.flag ?? "" };
}
const score = (m: MatchT) =>
  m.homeScore != null && m.awayScore != null ? `${m.homeScore}–${m.awayScore}` : "vs";

// "🏴 England 2–1 🇺🇸 USA" (or "… vs …" for an upcoming match).
function matchLine(m: MatchT): string {
  const h = side(m.homeTeam, m.homeLabel);
  const a = side(m.awayTeam, m.awayLabel);
  return `${h.flag} ${h.name} ${score(m)} ${a.flag} ${a.name}`.replace(/\s+/g, " ").trim();
}

// Plain text for the commentary model: "England 2-1 USA" — no flag emoji (clean
// material for the model, and avoids it parroting emoji into prose).
function plainMatch(m: MatchT): string {
  const h = side(m.homeTeam, m.homeLabel).name;
  const a = side(m.awayTeam, m.awayLabel).name;
  const sc = m.homeScore != null && m.awayScore != null ? `${m.homeScore}-${m.awayScore}` : "vs";
  return `${h} ${sc} ${a}`;
}

const STAGE_NAME: Record<string, string> = {
  R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals",
  SF: "Semi-finals", THIRD_PLACE: "Third-place playoff", FINAL: "Final",
};
function roundOf(m: MatchT): string {
  if (m.stage === "GROUP") return `Matchday ${m.matchday ?? "?"}`;
  return STAGE_NAME[m.stage] ?? m.stage;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export async function buildDigest(now: Date): Promise<DigestData> {
  const settings = await getSettings();
  const prev = (settings.digestSnapshot as Snapshot | null) ?? null;

  // First-run fallback window: with no prior snapshot, report finished matches
  // from the last ~26h so the first digest isn't empty (without dumping the whole
  // tournament's history).
  const windowStart = prev?.takenAt
    ? new Date(prev.takenAt)
    : new Date(now.getTime() - 26 * 60 * 60 * 1000);

  const [lb, matches] = await Promise.all([
    buildLeaderboard(),
    prisma.match.findMany({ include: { homeTeam: true, awayTeam: true }, orderBy: { kickoff: "asc" } }),
  ]);

  // "Since the last digest" = matches that have FINISHED but weren't reported in a
  // previous digest, tracked by id rather than kickoff time. Keying on kickoff
  // dropped any game still in play when the digest ran (e.g. a 06:00 kickoff vs
  // the 06:27 post): it finished after that window closed, yet its kickoff fell
  // before the next window opened, so it was never reported at all.
  const finishedNow = matches.filter((m) => m.status === "FINISHED" && m.homeScore != null);
  const reported = prev?.reportedIds ? new Set(prev.reportedIds) : null;
  const recap = reported
    ? finishedNow.filter((m) => !reported.has(m.id))
    : finishedNow.filter((m) => m.kickoff >= windowStart && m.kickoff <= now);
  // Fixtures kicking off before the next daily digest (~24h out) — not just those
  // sharing today's Amsterdam calendar date. The tournament is in North America,
  // so evening/overnight games fall on the *next* Amsterdam day; a date-based
  // filter would drop them, and since they're FINISHED by the next morning's
  // digest they'd never get previewed at all. A 24h window previews every game
  // exactly once, the morning before it kicks off.
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const fixtures = matches.filter(
    (m) => m.status !== "FINISHED" && m.kickoff >= now && m.kickoff < windowEnd,
  );
  const rounds = [...new Set(fixtures.map(roundOf))];

  // Per-player points scored in the recap window, plus prediction-of-the-day /
  // flop-of-the-day. `prediction.points` already encodes joker doubling and the
  // flop penalty, so a single best/worst scan covers it.
  const recapIds = recap.map((m) => m.id);
  const preds = recapIds.length
    ? await prisma.prediction.findMany({
        where: { matchId: { in: recapIds } },
        include: {
          player: { select: { name: true } },
          match: { include: { homeTeam: true, awayTeam: true } },
        },
      })
    : [];

  const byPlayer = new Map<string, { name: string; pts: number; exact: number }>();
  let best: { p: (typeof preds)[number]; } | null = null;
  let flop: { p: (typeof preds)[number]; } | null = null;
  for (const p of preds) {
    const g = byPlayer.get(p.playerId) ?? { name: p.player.name, pts: 0, exact: 0 };
    g.pts += p.points;
    const m = p.match;
    if (m.homeScore != null && m.awayScore != null && p.homeScore === m.homeScore && p.awayScore === m.awayScore) {
      g.exact++;
    }
    byPlayer.set(p.playerId, g);
    if (p.points > 0 && (!best || p.points > best.p.points)) best = { p };
    if (p.points < 0 && (!flop || p.points < flop.p.points)) flop = { p };
  }
  const gainers = [...byPlayer.values()].filter((g) => g.pts !== 0).sort((a, b) => b.pts - a.pts);

  const toAward = (x: typeof best): Award | null =>
    x && {
      name: x.p.player.name,
      pred: `${x.p.homeScore}–${x.p.awayScore}`,
      line: matchLine(x.p.match),
      plain: plainMatch(x.p.match),
      pts: x.p.points,
    };

  // Standings with movement vs the previous snapshot.
  const prevRanks = prev?.ranks ?? {};
  const standings: StandingRow[] = lb.map((r, i) => {
    const was = prevRanks[r.playerId];
    return {
      rank: i,
      name: r.name,
      total: r.total,
      matchPoints: r.matchPoints,
      bonusPoints: r.bonusPoints,
      move: was ? was.rank - i : 0,
      streak: r.streak,
    };
  });

  const hottestRow = [...standings].sort((a, b) => b.streak - a.streak)[0];
  const hottest = hottestRow && hottestRow.streak >= 2
    ? { name: hottestRow.name, streak: hottestRow.streak }
    : null;

  const snapshot: Snapshot = {
    takenAt: now.toISOString(),
    ranks: Object.fromEntries(lb.map((r, i) => [r.playerId, { rank: i, total: r.total }])),
    reportedIds: finishedNow.map((m) => m.id), // baseline: everything finished as of this post
  };

  return {
    now,
    settingsId: settings.id,
    hasContent: recap.length > 0 || fixtures.length > 0,
    standings,
    recap,
    gainers,
    fixtures,
    rounds,
    best: toAward(best),
    flop: toAward(flop),
    hottest,
    snapshot,
  };
}

// Persist the standings baseline after a real post (not for previews).
export async function saveDigestSnapshot(d: DigestData): Promise<void> {
  await prisma.settings.update({
    where: { id: d.settingsId },
    data: { digestSnapshot: d.snapshot as unknown as Prisma.InputJsonValue },
  });
}

// Compact, plain-text fact sheet handed to the commentary model. Everything the
// model is allowed to mention lives here — it must not invent anything else.
// `change` on a standing = places moved since the last digest (+climb / -drop).
export function digestFacts(d: DigestData) {
  return {
    date: amsPretty(d.now),
    results: d.recap.map(plainMatch),
    standings: d.standings.map((s) => ({ rank: s.rank + 1, player: s.name, points: s.total, change: s.move })),
    pointsWonSinceLastDigest: d.gainers.map((g) => ({ player: g.name, points: g.pts, exactScorelines: g.exact })),
    predictionOfTheDay: d.best && { player: d.best.name, predicted: d.best.pred, actual: d.best.plain, points: d.best.pts },
    flopOfTheDay: d.flop && { player: d.flop.name, predicted: d.flop.pred, actual: d.flop.plain, points: d.flop.pts },
    hottestStreak: d.hottest,
    todaysFixtures: d.fixtures.map((m) => `${plainMatch(m)} (${amsTime(m.kickoff)})`),
  };
}

// ---------------------------------------------------------------------------
// Render → Slack Block Kit
// ---------------------------------------------------------------------------

function pad(s: string, n: number, end = true): string {
  if (s.length >= n) return s.slice(0, n);
  const fill = " ".repeat(n - s.length);
  return end ? s + fill : fill + s;
}

function standingsTable(rows: StandingRow[]): string {
  // Monospaced code block keeps columns aligned. No flags here — emoji widths
  // vary and would break alignment; arrows sit at line-end so they don't.
  const lines = rows.map((r) => {
    const rank = pad(String(r.rank + 1), 2, false);
    const name = pad(r.name, 14);
    const total = pad(String(r.total), 4, false);
    const mv = r.move > 0 ? `  ▲${r.move}` : r.move < 0 ? `  ▼${-r.move}` : "";
    return `${rank}  ${name} ${total}${mv}`;
  });
  return "```\n" + (lines.join("\n") || "no players yet") + "\n```";
}

function section(text: string): SlackBlock {
  return { type: "section", text: { type: "mrkdwn", text } };
}
const divider: SlackBlock = { type: "divider" };

export function renderDigestBlocks(
  d: DigestData,
  commentary?: string | null,
): { text: string; blocks: SlackBlock[] } {
  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: `⚽ World Cup Pool — ${amsPretty(d.now)}`, emoji: true } },
  ];

  // Optional AI commentary — a pull-quote from "the gantry" under the header.
  if (commentary) {
    const quoted = commentary.trim().split("\n").map((l) => `> ${l}`).join("\n");
    blocks.push(section(`🎙️ *Word from the gantry*\n${quoted}`));
  }

  // 1) Standings (+ biggest movers)
  let standingsText = `*🏆 Standings*\n${standingsTable(d.standings)}`;
  const movers = d.standings.filter((s) => s.move !== 0).sort((a, b) => Math.abs(b.move) - Math.abs(a.move));
  const climb = movers.find((m) => m.move > 0);
  const drop = movers.find((m) => m.move < 0);
  const moverBits: string[] = [];
  if (climb) moverBits.push(`📈 Biggest climb: *${climb.name}* (▲${climb.move})`);
  if (drop) moverBits.push(`📉 Biggest drop: *${drop.name}* (▼${-drop.move})`);
  if (moverBits.length) standingsText += `\n${moverBits.join("  ·  ")}`;
  blocks.push(section(standingsText));

  // 2) Results since the last digest
  if (d.recap.length) {
    const results = d.recap.map((m) => `• ${matchLine(m)}`).join("\n");
    let text = `*🗓️ Since yesterday*\n${results}`;
    const top = d.gainers.filter((g) => g.pts > 0).slice(0, 3);
    if (top.length) {
      const bits = top.map((g) => `*${g.name}* +${g.pts}${g.exact ? ` (${g.exact} exact)` : ""}`);
      text += `\n\n_Best returns:_ ${bits.join("  ·  ")}`;
    }
    blocks.push(divider, section(text));
  }

  // 3) Tonight's fixtures + lock reminder (everything up to the next digest)
  if (d.fixtures.length) {
    const list = d.fixtures.map((m) => `\`${amsTime(m.kickoff)}\`  ${matchLine(m)}`).join("\n");
    let text = `*📅 Tonight*\n${list}`;
    text += `\n\n🔒 Scores — and your ⭐ joker — lock at each kickoff. Get them in!`;
    if (d.rounds.length) text += `\n_Joker round${d.rounds.length > 1 ? "s" : ""} in play: ${d.rounds.join(", ")}._`;
    blocks.push(divider, section(text));
  }

  // 4) Fun awards
  const awards: string[] = [];
  if (d.best) awards.push(`🎯 *Prediction of the day:* ${d.best.name} called *${d.best.pred}* — ${d.best.line} (+${d.best.pts})`);
  if (d.flop) awards.push(`🥶 *Flop of the day:* ${d.flop.name} jokered *${d.flop.pred}* — ${d.flop.line} (${d.flop.pts})`);
  if (d.hottest) awards.push(`🔥 *Hot streak:* ${d.hottest.name} — ${d.hottest.streak} in a row`);
  if (awards.length) blocks.push(divider, section(awards.join("\n")));

  // Footer
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `<${appUrl}|Open the table → set your scores & jokers>` }],
    });
  }

  const text = `World Cup Pool — ${amsPretty(d.now)}`;
  return { text, blocks };
}
