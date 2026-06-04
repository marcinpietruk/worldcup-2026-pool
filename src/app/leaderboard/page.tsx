"use client";

import { useEffect, useRef } from "react";
import { Trophy, Medal, Crown, Target, ChartColumn, Award, Brain, Sparkles } from "lucide-react";
import { getPlayer } from "@/lib/client";
import { useLive } from "@/lib/useLive";
import { Card, Spinner, Message } from "@/components/ui";

const BADGE: Record<string, { Icon: typeof Crown; cls: string }> = {
  "👑": { Icon: Crown, cls: "bdg--sun" },
  "🎯": { Icon: Target, cls: "bdg--tomato" },
  "📊": { Icon: ChartColumn, cls: "bdg--sky" },
  "💯": { Icon: Award, cls: "bdg--grass" },
  "🧠": { Icon: Brain, cls: "bdg--sky" },
  "🔮": { Icon: Sparkles, cls: "bdg--sun" },
};

export default function LeaderboardPage() {
  const { live, error: err } = useLive();
  const meId = getPlayer()?.id;
  const prevRanks = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (live) prevRanks.current = new Map(live.leaderboard.map((r, i) => [r.playerId, i]));
  }, [live]);

  if (err && !live) return <Message kind="error">{err}</Message>;
  if (!live) return <Spinner label="Loading the table…" />;

  const rows = live.leaderboard;
  const movementOf = (id: string, idx: number) => {
    const prev = prevRanks.current.get(id);
    return prev === undefined ? 0 : prev - idx;
  };

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>The Table</h1>
          <div className="sub">Most points wins · auto-updating</div>
        </div>
        <div className="tag">{rows.length} players</div>
      </div>

      {rows.length === 0 ? (
        <Message kind="info">No players yet — be the first to join and predict!</Message>
      ) : (
        <Card className="lb">
          <div className="lb__row lb__cols head">
            <div>#</div>
            <div>Player</div>
            <div className="colcell">Mch</div>
            <div className="colcell">Brk</div>
            <div className="colcell">Bon</div>
            <div style={{ textAlign: "right" }}>Total</div>
          </div>
          {rows.map((r, i) => {
            const isMe = r.playerId === meId;
            const move = movementOf(r.playerId, i);
            return (
              <div key={r.playerId} className={`lb__row lb__cols${isMe ? " me" : ""}`}>
                <div className="rk">
                  {i === 0 ? (
                    <span className="medalc medalc--g"><Trophy className="ic-svg" /></span>
                  ) : i === 1 ? (
                    <span className="medalc medalc--s"><Medal className="ic-svg" /></span>
                  ) : i === 2 ? (
                    <span className="medalc medalc--b"><Medal className="ic-svg" /></span>
                  ) : (
                    i + 1
                  )}
                  {move > 0 && <span className="mv up" title={`up ${move}`}>▲{move}</span>}
                  {move < 0 && <span className="mv dn" title={`down ${-move}`}>▼{-move}</span>}
                </div>
                <div className="lp">
                  <div className="nm">
                    {r.name}
                    {isMe && <span className="you">you</span>}
                    {r.badges.length > 0 && (
                      <span className="badges">
                        {r.badges.map((b) => {
                          const m = BADGE[b.icon];
                          if (!m) return null;
                          const Icon = m.Icon;
                          return (
                            <span key={b.label} className={`bdg ${m.cls}`} title={b.label}>
                              <Icon className="ic-svg" />
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </div>
                  <div className="sub">{r.exactHits} exact · {r.resultHits} results</div>
                </div>
                <div className="colcell">{r.matchPoints}</div>
                <div className="colcell">{r.bracketPoints}</div>
                <div className="colcell">{r.bonusPoints}</div>
                <div className="lb-tot">
                  <div className="t num">{r.total}</div>
                </div>
              </div>
            );
          })}
        </Card>
      )}
      <p className="center muted" style={{ fontSize: 12 }}>
        Ties broken by most exact scores, then most correct results.
      </p>
    </div>
  );
}
