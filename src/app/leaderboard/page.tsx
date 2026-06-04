"use client";

import { useEffect, useRef } from "react";
import { getPlayer } from "@/lib/client";
import { useLive } from "@/lib/useLive";
import { Card, Spinner, Message } from "@/components/ui";

export default function LeaderboardPage() {
  const { live, error: err } = useLive();
  const meId = getPlayer()?.id;
  // Remember each player's rank from the previous poll to show movement arrows.
  const prevRanks = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (live) prevRanks.current = new Map(live.leaderboard.map((r, i) => [r.playerId, i]));
  }, [live]);

  if (err && !live) return <Message kind="error">{err}</Message>;
  if (!live) return <Spinner />;

  const rows = live.leaderboard;
  const medals = ["🥇", "🥈", "🥉"];
  const movementOf = (playerId: string, idx: number): number => {
    const prev = prevRanks.current.get(playerId);
    return prev === undefined ? 0 : prev - idx; // + = moved up
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Leaderboard</h1>
        <span className="text-xs text-slate-400">auto-updating</span>
      </div>

      {rows.length === 0 ? (
        <Message kind="info">No players yet — be the first to join and predict!</Message>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 w-12">#</th>
                <th className="px-3 py-2">Player</th>
                <th className="px-2 py-2 text-right">Match</th>
                <th className="px-2 py-2 text-right">Bracket</th>
                <th className="px-2 py-2 text-right">Bonus</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => {
                const isMe = r.playerId === meId;
                const move = movementOf(r.playerId, i);
                return (
                  <tr key={r.playerId} className={isMe ? "bg-emerald-50" : ""}>
                    <td className="px-3 py-2 font-bold text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        {medals[i] ?? i + 1}
                        {move > 0 && <span className="text-xs text-emerald-500" title={`up ${move}`}>▲</span>}
                        {move < 0 && <span className="text-xs text-rose-500" title={`down ${-move}`}>▼</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      <span className="inline-flex items-center gap-1.5">
                        {r.name} {isMe && <span className="text-xs font-normal text-emerald-600">(you)</span>}
                        {r.badges.map((b) => (
                          <span key={b.label} title={b.label}>{b.icon}</span>
                        ))}
                      </span>
                      <div className="text-xs font-normal text-slate-400">
                        {r.exactHits} exact · {r.resultHits} results
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right text-slate-500">{r.matchPoints}</td>
                    <td className="px-2 py-2 text-right text-slate-500">{r.bracketPoints}</td>
                    <td className="px-2 py-2 text-right text-slate-500">{r.bonusPoints}</td>
                    <td className="px-3 py-2 text-right text-lg font-extrabold text-emerald-600">{r.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-center text-xs text-slate-400">
        Ties broken by most exact scores, then most correct results.
      </p>
    </div>
  );
}
