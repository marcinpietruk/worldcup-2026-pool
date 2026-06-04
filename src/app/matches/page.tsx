"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getPlayer, fetchState, type StateResponse, type MatchDTO, type SettingsDTO } from "@/lib/client";
import { useLive } from "@/lib/useLive";
import { Card, Spinner, Message } from "@/components/ui";
import { Flag } from "@/components/Flag";
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

  const filtered = useMemo(
    () => (!live ? [] : filter === "all" ? live.matches : live.matches.filter((m) => m.status === filter)),
    [live, filter],
  );

  if (err) return <Message kind="error">{err}</Message>;
  if (!live || !settings) return <Spinner label="Loading matches…" />;

  const liveCount = live.matches.filter((m) => m.status === "LIVE").length;

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>Matches</h1>
          <div className="sub">{live.matches.length} games · auto-updating</div>
        </div>
        {liveCount > 0 && (
          <span className="live-flag"><span className="live-dot" /> {liveCount} live</span>
        )}
      </div>

      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <div className="filterpills">
          {(["all", "LIVE", "SCHEDULED", "FINISHED"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`fp${filter === f ? " active" : ""}`}>
              {f === "all" ? "All" : f === "SCHEDULED" ? "Upcoming" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        {hasStandings && (
          <button
            className="fp"
            onClick={() => setShowStandings((s) => !s)}
            style={showStandings ? { background: "var(--sun)", color: "#241a10" } : undefined}
          >
            {showStandings ? "Hide standings" : "Show standings"}
          </button>
        )}
      </div>

      {hasStandings && showStandings && <StandingsGrid groups={standings} />}

      <div className="stack-sm">
        {filtered.map((m) => (
          <Link key={m.id} href={`/matches/${m.id}`} style={{ display: "block" }}>
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
    <div className={`card match${isLive ? " is-live" : ""}`}>
      <div className="match__top">
        <span className="tag">{STAGE_LABEL[match.stage]}{match.group ? ` · Group ${match.group}` : ""}</span>
        {isLive ? (
          <span className="live-flag"><span className="live-dot" /> Live</span>
        ) : (
          <span className="tag">{formatKickoff(match.kickoff)}</span>
        )}
      </div>
      <div className="mrow">
        <div className="team r">
          <span className={`nm${home.faded ? " faded" : ""}`}>{home.name}</span>
          <Flag iso2={home.iso2} name={home.name} />
        </div>
        {match.homeScore != null ? (
          <span className={`score${isLive ? " is-live" : ""}`}>{match.homeScore}–{match.awayScore}</span>
        ) : (
          <span className="score vs">vs</span>
        )}
        <div className="team">
          <Flag iso2={away.iso2} name={away.name} />
          <span className={`nm${away.faded ? " faded" : ""}`}>{away.name}</span>
        </div>
      </div>
      {pred && (
        <div className="pick">
          {isJoker && <span className="star">⭐</span>}
          Your pick: <b>{pred.homeScore}–{pred.awayScore}</b>
          {isFin && pts != null && (
            <span className={`pts num ${pts > 0 ? "plus" : pts < 0 ? "minus" : "zero"}`}>{pts > 0 ? `+${pts}` : pts}</span>
          )}
        </div>
      )}
    </div>
  );
}

function StandingsGrid({ groups }: { groups: ReturnType<typeof computeStandings> }) {
  return (
    <div className="stand-grid">
      {groups.map((g) => (
        <Card key={g.group} className="stand overflow-hidden">
          <div className="card__head">
            Group {g.group}
            <span className="qpill">top 2 advance</span>
          </div>
          <table>
            <thead>
              <tr>
                <th className="l">Team</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GD</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={r.teamId} className={i < 2 ? "qual" : ""}>
                  <td className="l"><Flag iso2={r.iso2} name={r.name} size="sm" /> {r.name}</td>
                  <td>{r.p}</td>
                  <td>{r.w}</td>
                  <td>{r.d}</td>
                  <td>{r.l}</td>
                  <td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                  <td><span className="pts num">{r.pts}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
