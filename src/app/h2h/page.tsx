"use client";

import { useEffect, useState } from "react";
import { getPlayer, getJSON } from "@/lib/client";
import { Card, Spinner, Message } from "@/components/ui";

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
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>Head-to-head</h1>
          <div className="sub">Compare two players across the games they both predicted (finished only).</div>
        </div>
      </div>

      <div className="h2h-pick">
        <Select value={a} onChange={setA} players={players} exclude={b} />
        <span className="vs">vs</span>
        <Select value={b} onChange={setB} players={players} exclude={a} />
      </div>

      {loading && <Spinner />}
      {!loading && data && (
        <>
          <Card>
            <div className="h2h-sum">
              <div className={`side${data.tally.a > data.tally.b ? " win" : ""}`}>
                <div className="nm">{data.tally.a > data.tally.b && <span className="crown">👑 </span>}{data.a.name}</div>
                <div className="pts">{data.a.points} pts shared</div>
              </div>
              <div className="mid">
                <div className="score num">{data.tally.a}–{data.tally.b}</div>
                <div className="lbl">{data.tally.tie > 0 ? `${data.tally.tie} tied · ` : ""}matches won</div>
              </div>
              <div className={`side${data.tally.b > data.tally.a ? " win" : ""}`}>
                <div className="nm">{data.b.name}{data.tally.b > data.tally.a && <span className="crown"> 👑</span>}</div>
                <div className="pts">{data.b.points} pts shared</div>
              </div>
            </div>
          </Card>

          {data.rows.length === 0 ? (
            <Message kind="info">No finished matches both have predicted yet.</Message>
          ) : (
            <Card className="lb">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Match</th>
                    <th className="c">Result</th>
                    <th className="c">{data.a.name}</th>
                    <th className="c">{data.b.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.match}</td>
                      <td className="c num">{r.result}</td>
                      <td className={`c${r.winner === "a" ? " win" : ""}`}>{r.aPick} <small>({r.aPts >= 0 ? `+${r.aPts}` : r.aPts})</small></td>
                      <td className={`c${r.winner === "b" ? " win" : ""}`}>{r.bPick} <small>({r.bPts >= 0 ? `+${r.bPts}` : r.bPts})</small></td>
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

function Select({ value, onChange, players, exclude }: { value: string; onChange: (v: string) => void; players: PlayerOpt[]; exclude: string }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— pick a player —</option>
      {players.filter((p) => p.id !== exclude).map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
