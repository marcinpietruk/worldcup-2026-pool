"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getPlayer, getJSON, postJSON, type MatchDTO, type MatchEventDTO } from "@/lib/client";
import { Card, Button, Spinner, Message } from "@/components/ui";
import { Flag } from "@/components/Flag";
import { STAGE_LABEL, formatKickoff, sideOf } from "@/lib/format";

type Pick = { playerId: string; player: string; homeScore: number; awayScore: number; points: number };
type CommentDTO = { id: string; playerId: string; player: string; body: string; createdAt: string };
type Detail = { match: MatchDTO; revealed: boolean; picks: Pick[] | null; predictionCount: number; comments: CommentDTO[] };

const EVENT_ICON: Record<string, string> = { goal: "⚽", yellow: "🟨", red: "🟥" };
const minNum = (min: string) => { const m = min.match(/\d+/); return m ? parseInt(m[0], 10) : 0; };
const sortedEvents = (evs: MatchEventDTO[]) => [...evs].sort((a, b) => minNum(a.min) - minNum(b.min));

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const meId = getPlayer()?.id;

  const load = useCallback(() => {
    getJSON<Detail>(`/api/matches/${id}`).then(setData).catch((e) => setErr(String(e)));
  }, [id]);
  useEffect(() => { load(); }, [load]);

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
          {m.status === "LIVE" ? <span className="live-flag"><span className="live-dot" /> {m.statusDetail ?? "Live"}</span> : <span className="tag">{formatKickoff(m.kickoff)}</span>}
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
        {(m.homeRecord || m.awayRecord) && (
          <div className="mrow" style={{ paddingTop: 0, fontSize: 12 }}>
            <span className="muted" style={{ textAlign: "right" }}>{m.homeRecord}</span>
            <span className="muted" style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>record · W-D-L</span>
            <span className="muted" style={{ textAlign: "left" }}>{m.awayRecord}</span>
          </div>
        )}
        {(m.venue || m.attendance) && (
          <div className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: 4 }}>
            {[m.venue, m.attendance ? `👥 ${m.attendance.toLocaleString()}` : null].filter(Boolean).join("  ·  ")}
          </div>
        )}
      </Card>

      {m.events && m.events.length > 0 && (
        <Card className="lb">
          <div className="card__head">Match events</div>
          <div className="card__body" style={{ position: "relative", padding: "10px 14px" }}>
            {/* center spine */}
            <div style={{ position: "absolute", left: "50%", top: 8, bottom: 8, borderLeft: "2px solid var(--line)", transform: "translateX(-1px)" }} />
            {sortedEvents(m.events).map((ev, i) => {
              const home = ev.team === m.home?.name;
              const icon = EVENT_ICON[ev.type] ?? "•";
              const min = <span className="num muted">{ev.min}</span>;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "baseline", padding: "5px 0", fontSize: 14 }}>
                  <div style={{ textAlign: "right", paddingRight: 16 }}>
                    {home && <>{ev.player ?? "—"} {icon} {min}</>}
                  </div>
                  <div style={{ textAlign: "left", paddingLeft: 16 }}>
                    {!home && <>{min} {icon} {ev.player ?? "—"}</>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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

      <Comments matchId={id} comments={data.comments} onPosted={load} />
    </div>
  );
}

function Comments({ matchId, comments, onPosted }: { matchId: string; comments: CommentDTO[]; onPosted: () => void }) {
  const meId = getPlayer()?.id;
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post() {
    const player = getPlayer();
    if (!player) return setErr("Join first to chime in.");
    if (!body.trim()) return;
    setBusy(true);
    const res = await postJSON(`/api/matches/${matchId}/comments`, { playerId: player.id, pin: player.pin, body });
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setBody(""); setErr(null);
    onPosted();
  }

  return (
    <Card className="lb">
      <div className="card__head">💬 Trash talk ({comments.length})</div>
      <div className="card__body stack-sm">
        {comments.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No comments yet — start the banter.</p>}
        {comments.map((c) => (
          <div key={c.id} style={{ borderBottom: "var(--bd-thin)", paddingBottom: 8 }}>
            <div style={{ fontSize: 12.5 }}>
              <b style={{ color: c.playerId === meId ? "var(--grass-ink)" : "var(--ink)" }}>{c.player}</b>{" "}
              <span className="muted">· {new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 14 }}>{c.body}</div>
          </div>
        ))}
        {getPlayer() ? (
          <div className="row" style={{ alignItems: "flex-start" }}>
            <input className="input" value={body} onChange={(e) => setBody(e.target.value.slice(0, 280))} placeholder="Say something…" onKeyDown={(e) => { if (e.key === "Enter") post(); }} />
            <Button onClick={post} disabled={busy || !body.trim()}>Post</Button>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>Join to join the banter.</p>
        )}
        {err && <Message kind="error">{err}</Message>}
      </div>
    </Card>
  );
}
