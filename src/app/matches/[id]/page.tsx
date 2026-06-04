"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getPlayer, getJSON, type MatchDTO } from "@/lib/client";
import { Card, Spinner, Message } from "@/components/ui";
import { Flag } from "@/components/Flag";
import { STAGE_LABEL, formatKickoff, sideOf } from "@/lib/format";

type Pick = { playerId: string; player: string; homeScore: number; awayScore: number; points: number };
type Detail = { match: MatchDTO; revealed: boolean; picks: Pick[] | null; predictionCount: number };

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const meId = getPlayer()?.id;

  useEffect(() => {
    getJSON<Detail>(`/api/matches/${id}`).then(setData).catch((e) => setErr(String(e)));
  }, [id]);

  if (err) return <Message kind="error">{err}</Message>;
  if (!data) return <Spinner />;

  const m = data.match;
  const home = sideOf(m, "home");
  const away = sideOf(m, "away");
  const isFin = m.status === "FINISHED";

  return (
    <div className="stack">
      <Link href="/matches" className="linkish">← All matches</Link>

      <Card className="match">
        <div className="match__top">
          <span className="tag">{STAGE_LABEL[m.stage]}{m.group ? ` · Group ${m.group}` : ""}</span>
          {m.status === "LIVE" ? <span className="live-flag"><span className="live-dot" /> Live</span> : <span className="tag">{formatKickoff(m.kickoff)}</span>}
        </div>
        <div className="mrow" style={{ padding: "10px 0" }}>
          <div className="team r">
            <span className={`nm${home.faded ? " faded" : ""}`} style={{ fontSize: 17 }}>{home.name}</span>
            <Flag iso2={home.iso2} name={home.name} size="lg" />
          </div>
          {m.homeScore != null ? (
            <span className="score" style={{ fontSize: 30 }}>{m.homeScore}–{m.awayScore}</span>
          ) : (
            <span className="score vs">vs</span>
          )}
          <div className="team">
            <Flag iso2={away.iso2} name={away.name} size="lg" />
            <span className={`nm${away.faded ? " faded" : ""}`} style={{ fontSize: 17 }}>{away.name}</span>
          </div>
        </div>
      </Card>

      {!data.revealed ? (
        <Message kind="info">🔒 Everyone&apos;s predictions are revealed after kickoff. {data.predictionCount} submitted so far.</Message>
      ) : (
        <Card className="lb">
          <div className="card__head">Everyone&apos;s picks ({data.picks?.length ?? 0})</div>
          {data.picks && data.picks.length > 0 ? (
            <table className="dtable">
              <tbody>
                {data.picks.map((p) => (
                  <tr key={p.playerId} className={p.playerId === meId ? "me" : ""}>
                    <td style={{ fontWeight: 800 }}>{p.player}{p.playerId === meId && <span className="you" style={{ marginLeft: 6 }}>you</span>}</td>
                    <td className="c num">{p.homeScore}–{p.awayScore}</td>
                    <td className="r">
                      {isFin && <span className={`pts num ${p.points > 0 ? "plus" : p.points < 0 ? "minus" : "zero"}`}>{p.points > 0 ? `+${p.points}` : p.points}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="card__body muted">No one predicted this match.</div>
          )}
        </Card>
      )}
    </div>
  );
}
