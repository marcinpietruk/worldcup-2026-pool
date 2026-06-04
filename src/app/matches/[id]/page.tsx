"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getPlayer, getJSON, type MatchDTO } from "@/lib/client";
import { Card, Spinner, Message } from "@/components/ui";
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
  const finished = m.status === "FINISHED";

  return (
    <div className="space-y-4">
      <Link href="/matches" className="text-sm text-slate-400 hover:text-slate-600">← All matches</Link>

      <Card className="overflow-hidden">
        <div className="brand-gradient px-5 py-2 text-xs font-semibold text-white/90">
          {STAGE_LABEL[m.stage]}{m.group ? ` · Group ${m.group}` : ""} ·{" "}
          {m.status === "LIVE" ? "LIVE" : formatKickoff(m.kickoff)}
        </div>
        <div className="flex items-center justify-center gap-4 px-5 py-6">
          <div className="flex flex-1 items-center justify-end gap-2 text-right">
            <span className={`font-bold ${home.faded ? "italic text-slate-400" : "text-slate-800"}`}>{home.name}</span>
            <span className="text-3xl">{home.flag || "🏳️"}</span>
          </div>
          <div className="min-w-20 text-center">
            {m.homeScore != null ? (
              <span className="text-3xl font-extrabold text-slate-800">{m.homeScore}–{m.awayScore}</span>
            ) : (
              <span className="text-lg text-slate-300">vs</span>
            )}
          </div>
          <div className="flex flex-1 items-center gap-2">
            <span className="text-3xl">{away.flag || "🏳️"}</span>
            <span className={`font-bold ${away.faded ? "italic text-slate-400" : "text-slate-800"}`}>{away.name}</span>
          </div>
        </div>
      </Card>

      {!data.revealed ? (
        <Message kind="info">
          🔒 Everyone&apos;s predictions are revealed after kickoff. {data.predictionCount} submitted so far.
        </Message>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600">
            Everyone&apos;s picks ({data.picks?.length ?? 0})
          </div>
          {data.picks && data.picks.length > 0 ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {data.picks.map((p) => (
                  <tr key={p.playerId} className={p.playerId === meId ? "bg-emerald-50" : ""}>
                    <td className="px-4 py-2 font-medium text-slate-700">
                      {p.player} {p.playerId === meId && <span className="text-xs text-emerald-600">(you)</span>}
                    </td>
                    <td className="px-2 py-2 text-center font-semibold text-slate-600">{p.homeScore}–{p.awayScore}</td>
                    <td className="px-4 py-2 text-right">
                      {finished && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.points > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                          +{p.points}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-3 text-sm text-slate-400">No one predicted this match.</div>
          )}
        </Card>
      )}
    </div>
  );
}
