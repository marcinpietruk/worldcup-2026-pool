"use client";

import { useEffect, useState } from "react";
import { getPlayer, getJSON } from "@/lib/client";
import { Card, Spinner, Message, SectionTitle } from "@/components/ui";

type PlayerOpt = { id: string; name: string };
type Row = { match: string; result: string; aPick: string; aPts: number; bPick: string; bPts: number; winner: "a" | "b" | "tie" };
type Comparison = {
  a: { id: string; name: string; points: number };
  b: { id: string; name: string; points: number };
  rows: Row[];
  tally: { a: number; b: number; tie: number };
};
type Resp = { players: PlayerOpt[]; comparison: Comparison | null };

export default function H2HPage() {
  const [players, setPlayers] = useState<PlayerOpt[]>([]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [data, setData] = useState<Comparison | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getJSON<Resp>("/api/h2h")
      .then((r) => {
        setPlayers(r.players);
        const me = getPlayer()?.id;
        if (me && r.players.some((p) => p.id === me)) setA(me);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!a || !b || a === b) { setData(null); return; }
    setLoading(true);
    getJSON<Resp>(`/api/h2h?a=${a}&b=${b}`)
      .then((r) => setData(r.comparison))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [a, b]);

  if (err) return <Message kind="error">{err}</Message>;

  return (
    <div className="space-y-4">
      <SectionTitle sub="Compare two players across the matches they both predicted (finished games only).">
        Head-to-head
      </SectionTitle>

      <div className="flex items-center gap-2">
        <PlayerSelect value={a} onChange={setA} players={players} exclude={b} />
        <span className="font-bold text-slate-400">vs</span>
        <PlayerSelect value={b} onChange={setB} players={players} exclude={a} />
      </div>

      {loading && <Spinner />}
      {!loading && data && (
        <>
          <Card className="grid grid-cols-3 items-center p-5 text-center">
            <Side name={data.a.name} points={data.a.points} win={data.tally.a > data.tally.b} />
            <div className="text-sm text-slate-400">
              <div className="text-2xl font-extrabold text-slate-700">{data.tally.a}–{data.tally.b}</div>
              {data.tally.tie > 0 && <div>({data.tally.tie} tied)</div>}
              <div className="mt-1 text-xs">matches won head-to-head</div>
            </div>
            <Side name={data.b.name} points={data.b.points} win={data.tally.b > data.tally.a} />
          </Card>

          {data.rows.length === 0 ? (
            <Message kind="info">No finished matches both have predicted yet.</Message>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Match</th>
                    <th className="px-2 py-2 text-center">Result</th>
                    <th className="px-2 py-2 text-center">{data.a.name}</th>
                    <th className="px-2 py-2 text-center">{data.b.name}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-600">{r.match}</td>
                      <td className="px-2 py-2 text-center font-semibold text-slate-700">{r.result}</td>
                      <td className={`px-2 py-2 text-center ${r.winner === "a" ? "font-bold text-emerald-600" : "text-slate-500"}`}>
                        {r.aPick} <span className="text-xs">({r.aPts >= 0 ? `+${r.aPts}` : r.aPts})</span>
                      </td>
                      <td className={`px-2 py-2 text-center ${r.winner === "b" ? "font-bold text-emerald-600" : "text-slate-500"}`}>
                        {r.bPick} <span className="text-xs">({r.bPts >= 0 ? `+${r.bPts}` : r.bPts})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
      {!loading && !data && <Message kind="info">Pick two players to compare.</Message>}
    </div>
  );
}

function PlayerSelect({ value, onChange, players, exclude }: { value: string; onChange: (v: string) => void; players: PlayerOpt[]; exclude: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
    >
      <option value="">— pick a player —</option>
      {players.filter((p) => p.id !== exclude).map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}

function Side({ name, points, win }: { name: string; points: number; win: boolean }) {
  return (
    <div>
      <div className={`text-lg font-bold ${win ? "text-emerald-600" : "text-slate-700"}`}>{name}</div>
      <div className="text-sm text-slate-400">{points} pts (shared)</div>
    </div>
  );
}
