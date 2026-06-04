"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getPlayer,
  fetchState,
  type StateResponse,
  type MatchDTO,
  type SettingsDTO,
} from "@/lib/client";
import { useLive } from "@/lib/useLive";
import { Card, Spinner, Message } from "@/components/ui";
import { STAGE_LABEL, formatKickoff, sideOf } from "@/lib/format";
import { computeStandings } from "@/lib/standings";

type Filter = "all" | "LIVE" | "SCHEDULED" | "FINISHED";

export default function MatchesPage() {
  const [settings, setSettings] = useState<SettingsDTO | null>(null);
  const [myPreds, setMyPreds] = useState<StateResponse["me"]>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showStandings, setShowStandings] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { live } = useLive();

  const standings = useMemo(() => computeStandings(live?.matches ?? []), [live]);
  const hasStandings = standings.some((g) => g.rows.some((r) => r.p > 0));

  useEffect(() => {
    fetchState(getPlayer())
      .then((s) => { setSettings(s.settings); setMyPreds(s.me); })
      .catch((e) => setErr(String(e)));
  }, []);

  const filtered = useMemo(() => {
    if (!live) return [];
    const ms = filter === "all" ? live.matches : live.matches.filter((m) => m.status === filter);
    return ms;
  }, [live, filter]);

  if (err) return <Message kind="error">{err}</Message>;
  if (!live || !settings) return <Spinner />;

  const liveCount = live.matches.filter((m) => m.status === "LIVE").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Matches</h1>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {liveCount > 0 && (
            <span className="flex items-center gap-1 font-semibold text-rose-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> {liveCount} live
            </span>
          )}
          <span>auto-updating</span>
        </div>
      </div>

      <div className="flex gap-1.5 text-sm">
        {(["all", "LIVE", "SCHEDULED", "FINISHED"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 font-semibold capitalize transition ${
              filter === f ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {f === "all" ? "All" : f === "SCHEDULED" ? "Upcoming" : f.toLowerCase()}
          </button>
        ))}
      </div>

      {hasStandings && (
        <div>
          <button
            onClick={() => setShowStandings((s) => !s)}
            className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200"
          >
            {showStandings ? "Hide" : "Show"} group standings
          </button>
          {showStandings && <StandingsGrid groups={standings} />}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((m) => (
          <Link key={m.id} href={`/matches/${m.id}`} className="block transition hover:brightness-[0.99]">
            <MatchCard match={m} me={myPreds} settings={settings} />
          </Link>
        ))}
        {filtered.length === 0 && <Message kind="info">No matches in this view.</Message>}
      </div>
    </div>
  );
}

function clientPoints(
  pred: { homeScore: number; awayScore: number } | undefined,
  m: MatchDTO,
  s: SettingsDTO,
  isJoker: boolean,
): number | null {
  if (!pred || m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) return null;
  let p =
    pred.homeScore === m.homeScore && pred.awayScore === m.awayScore
      ? s.pointsExact
      : Math.sign(pred.homeScore - pred.awayScore) === Math.sign(m.homeScore - m.awayScore)
        ? s.pointsResult
        : 0;
  if (isJoker) p = p > 0 ? p * s.jokerMultiplier : -s.jokerPenalty;
  return p;
}

function MatchCard({ match, me, settings }: { match: MatchDTO; me: StateResponse["me"]; settings: SettingsDTO }) {
  const home = sideOf(match, "home");
  const away = sideOf(match, "away");
  const pred = me?.predictions[match.id];
  const isJoker = me?.jokerMatchId === match.id;
  const pts = clientPoints(pred, match, settings, isJoker);
  const isLive = match.status === "LIVE";
  const isFin = match.status === "FINISHED";

  return (
    <Card className={`px-4 py-3 ${isLive ? "ring-2 ring-rose-400/40" : ""}`}>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
        <span>{STAGE_LABEL[match.stage]}{match.group ? ` · Group ${match.group}` : ""}</span>
        <span>
          {isLive ? <span className="font-semibold text-rose-600">● LIVE</span> : formatKickoff(match.kickoff)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Team flag={home.flag} name={home.name} faded={home.faded} align="right" />
        <div className="flex min-w-16 shrink-0 items-center justify-center">
          {match.homeScore != null ? (
            <span className={`rounded-md px-2 py-0.5 text-lg font-extrabold ${isLive ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-800"}`}>
              {match.homeScore} – {match.awayScore}
            </span>
          ) : (
            <span className="text-sm text-slate-300">vs</span>
          )}
        </div>
        <Team flag={away.flag} name={away.name} faded={away.faded} align="left" />
      </div>
      {pred && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs">
          {isJoker && <span title="Your joker">⭐</span>}
          <span className="text-slate-400">Your pick: <span className="font-semibold text-slate-600">{pred.homeScore}–{pred.awayScore}</span></span>
          {isFin && pts != null && (
            <span className={`rounded-full px-2 py-0.5 font-bold ${pts > 0 ? "bg-emerald-100 text-emerald-700" : pts < 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-400"}`}>
              {pts > 0 ? `+${pts}` : pts}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

function StandingsGrid({ groups }: { groups: ReturnType<typeof computeStandings> }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {groups.map((g) => (
        <Card key={g.group} className="overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600">
            Group {g.group}
          </div>
          <table className="w-full text-xs">
            <thead className="text-slate-400">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Team</th>
                <th className="px-1 font-medium">P</th>
                <th className="px-1 font-medium">GD</th>
                <th className="px-2 text-right font-medium">Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {g.rows.map((r, i) => (
                <tr key={r.teamId} className={i < 2 ? "bg-emerald-50/50" : ""}>
                  <td className="px-2 py-1 text-slate-700">{r.flag} {r.name}</td>
                  <td className="px-1 text-center text-slate-500">{r.p}</td>
                  <td className="px-1 text-center text-slate-500">{r.gd > 0 ? "+" : ""}{r.gd}</td>
                  <td className="px-2 text-right font-bold text-slate-700">{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

function Team({ flag, name, faded, align }: { flag: string; name: string; faded: boolean; align: "left" | "right" }) {
  return (
    <div className={`flex flex-1 items-center gap-2 ${align === "right" ? "justify-end text-right" : "justify-start"}`}>
      {align === "right" && <span className={`truncate font-medium ${faded ? "italic text-slate-400" : "text-slate-700"}`}>{name}</span>}
      <span className="text-2xl">{flag || "🏳️"}</span>
      {align === "left" && <span className={`truncate font-medium ${faded ? "italic text-slate-400" : "text-slate-700"}`}>{name}</span>}
    </div>
  );
}
