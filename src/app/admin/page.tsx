"use client";

import { useEffect, useState } from "react";
import { getJSON, postJSON, type StateResponse, type MatchDTO, type TeamDTO, type SettingsDTO } from "@/lib/client";
import { Card, Button, Message, Spinner, SectionTitle } from "@/components/ui";
import { STAGE_LABEL, STAGE_ORDER, formatKickoff, sideOf } from "@/lib/format";

type Tab = "results" | "scoring" | "tools" | "picks";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("results");
  const [state, setState] = useState<StateResponse | null>(null);

  async function loadState() {
    setState(await getJSON<StateResponse>("/api/state"));
  }
  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/admin/overview?password=${encodeURIComponent(password)}`);
    if (!res.ok) return setError("Wrong admin password.");
    setUnlocked(true);
    loadState();
  }

  if (!unlocked) {
    return (
      <Card className="" >
        <div className="card__body" style={{ maxWidth: 380, margin: "0 auto", width: "100%" }}>
          <h1 className="disp" style={{ fontSize: 21 }}>Admin <span className="adminbadge">staff</span></h1>
          <p className="muted" style={{ fontSize: 13, margin: "4px 0 14px" }}>Enter the shared admin password.</p>
          <form onSubmit={unlock} className="stack-sm">
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" />
            {error && <Message kind="error">{error}</Message>}
            <Button type="submit" disabled={!password}>Unlock</Button>
          </form>
        </div>
      </Card>
    );
  }

  return (
    <div className="stack">
      <div className="tabs">
        {(["results", "scoring", "tools", "picks"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`tab${tab === t ? " active" : ""}`}>
            {t === "picks" ? "Picks" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {!state ? <Spinner /> : (
        <>
          {tab === "results" && <ResultsTab state={state} password={password} onChange={loadState} />}
          {tab === "scoring" && <ScoringTab settings={state.settings} password={password} onChange={loadState} />}
          {tab === "tools" && <ToolsTab password={password} onChange={loadState} />}
          {tab === "picks" && <PicksTab password={password} />}
        </>
      )}
    </div>
  );
}

function ResultsTab({ state, password, onChange }: { state: StateResponse; password: string; onChange: () => void }) {
  const [stage, setStage] = useState("GROUP");
  const matches = state.matches.filter((m) => m.stage === stage);
  return (
    <div className="stack">
      <SectionTitle sub="Set scores/status manually (testing, or when the API lags). Recomputes instantly.">Enter / override results</SectionTitle>
      <select className="select" style={{ maxWidth: 220 }} value={stage} onChange={(e) => setStage(e.target.value)}>
        {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
      </select>
      <div className="stack-sm">
        {matches.map((m) => <ResultRow key={m.id} match={m} teams={state.teams} password={password} onSaved={onChange} />)}
      </div>
    </div>
  );
}

function ResultRow({ match, teams, password, onSaved }: { match: MatchDTO; teams: TeamDTO[]; password: string; onSaved: () => void }) {
  const [home, setHome] = useState(match.homeScore?.toString() ?? "");
  const [away, setAway] = useState(match.awayScore?.toString() ?? "");
  const [status, setStatus] = useState(match.status);
  const [homeTeamId, setHomeTeamId] = useState(match.home?.id ?? "");
  const [awayTeamId, setAwayTeamId] = useState(match.away?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const isKO = match.stage !== "GROUP";
  const h = sideOf(match, "home");
  const a = sideOf(match, "away");

  async function save() {
    setBusy(true); setSaved(false);
    const body: Record<string, unknown> = { password, matchId: match.id, status, homeScore: home === "" ? null : Number(home), awayScore: away === "" ? null : Number(away) };
    if (isKO) { body.homeTeamId = homeTeamId || null; body.awayTeamId = awayTeamId || null; }
    const res = await postJSON("/api/admin/result", body);
    setBusy(false);
    if (res.ok) { setSaved(true); onSaved(); }
  }

  return (
    <Card>
      <div className="card__body">
        <div className="tag" style={{ marginBottom: 6 }}>{formatKickoff(match.kickoff)}{match.group ? ` · Group ${match.group}` : ""}</div>
        <div className="adminrow">
          {isKO
            ? <select className="select" style={{ width: 130 }} value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}><option value="">{h.name}</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            : <span style={{ width: 120, textAlign: "right", fontWeight: 700, fontSize: 13 }}>{h.name}</span>}
          <input className="sinp" value={home} onChange={(e) => setHome(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" />
          <span className="colon">:</span>
          <input className="sinp" value={away} onChange={(e) => setAway(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" />
          {isKO
            ? <select className="select" style={{ width: 130 }} value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}><option value="">{a.name}</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            : <span style={{ width: 120, fontWeight: 700, fontSize: 13 }}>{a.name}</span>}
          <select className="select" style={{ width: 120 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="SCHEDULED">Scheduled</option>
            <option value="LIVE">Live</option>
            <option value="FINISHED">Finished</option>
          </select>
          <Button variant="ghost" className="btn--sm" onClick={save} disabled={busy} >{busy ? "…" : saved ? "✓ Saved" : "Save"}</Button>
        </div>
      </div>
    </Card>
  );
}

const POINT_FIELDS: { key: keyof SettingsDTO; label: string }[] = [
  { key: "pointsExact", label: "Exact score" },
  { key: "pointsResult", label: "Correct result" },
  { key: "bonusR16", label: "Reach R16 (each)" },
  { key: "bonusQF", label: "Reach QF (each)" },
  { key: "bonusSF", label: "Reach SF (each)" },
  { key: "bonusFinal", label: "Reach Final (each)" },
  { key: "bonusChampion", label: "Bracket champion" },
  { key: "bonusTournamentChampion", label: "Bonus: Champion" },
  { key: "bonusRunnerUp", label: "Bonus: Runner-up" },
  { key: "bonusGoldenBoot", label: "Bonus: Golden Boot" },
  { key: "jokerMultiplier", label: "Joker multiplier" },
  { key: "jokerPenalty", label: "Joker penalty" },
];

function ScoringTab({ settings, password, onChange }: { settings: SettingsDTO; password: string; onChange: () => void }) {
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(POINT_FIELDS.map((f) => [f.key, settings[f.key] as number])));
  const [goldenBoot, setGoldenBoot] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    const res = await postJSON("/api/admin/settings", { password, ...vals, actualGoldenBoot: goldenBoot || undefined });
    setBusy(false);
    setMsg(res.ok ? "Saved & recomputed." : "error" in res ? res.error : "Error");
    if (res.ok) onChange();
  }

  return (
    <div className="stack">
      <SectionTitle sub="Change any point value; the table recomputes immediately.">Scoring configuration</SectionTitle>
      <Card><div className="card__body scoring-grid">
        {POINT_FIELDS.map((f) => (
          <div key={f.key} className="field">
            <label>{f.label}</label>
            <input className="input" type="number" value={vals[f.key]} onChange={(e) => setVals((v) => ({ ...v, [f.key]: Number(e.target.value) }))} />
          </div>
        ))}
      </div></Card>
      <Card><div className="card__body field">
        <label>Actual Golden Boot winner (for bonus scoring)</label>
        <input className="input" value={goldenBoot} onChange={(e) => setGoldenBoot(e.target.value)} placeholder="Player name" />
      </div></Card>
      <div className="row"><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save scoring"}</Button>{msg && <span className="muted" style={{ fontSize: 13 }}>{msg}</span>}</div>
    </div>
  );
}

function ToolsTab({ password, onChange }: { password: string; onChange: () => void }) {
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function run(path: string, label: string) {
    setBusy(label); setOut(null);
    const res = await postJSON<Record<string, unknown>>(path, { password });
    setBusy(null);
    setOut(res.ok ? JSON.stringify(res.data) : `Error: ${"error" in res ? res.error : ""}`);
    if (res.ok) onChange();
  }
  return (
    <div className="stack">
      <SectionTitle sub="Sync from the live API, or rebuild fixtures from the bundled dataset.">Tools</SectionTitle>
      <Card><div className="card__body stack-sm">
        <div className="row wrap">
          <Button onClick={() => run("/api/admin/sync", "sync")} disabled={!!busy}>{busy === "sync" ? "Syncing…" : "Force live sync"}</Button>
          <Button variant="ghost" onClick={() => run("/api/admin/seed", "seed")} disabled={!!busy}>{busy === "seed" ? "Seeding…" : "Re-seed fixtures"}</Button>
        </div>
        {out && <pre className="codeout">{out}</pre>}
        <p className="muted" style={{ fontSize: 12 }}>Live sync needs a football-data.org token; otherwise it reports skipped.</p>
      </div></Card>
    </div>
  );
}

type Overview = {
  players: { id: string; name: string }[];
  predictions: { player: string; match: string; homeScore: number; awayScore: number; points: number }[];
  bonus: { player: string; champion: string | null; runnerUp: string | null; goldenBoot: string | null; points: number }[];
};

function PicksTab({ password }: { password: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [resetId, setResetId] = useState("");
  const [newPin, setNewPin] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  useEffect(() => { getJSON<Overview>(`/api/admin/overview?password=${encodeURIComponent(password)}`).then(setData).catch(() => {}); }, [password]);
  if (!data) return <Spinner />;

  async function resetPasscode() {
    setResetMsg(null);
    const res = await postJSON("/api/admin/passcode", { password, playerId: resetId, newPin });
    setResetMsg(res.ok ? "Passcode reset." : "error" in res ? res.error : "Error");
    if (res.ok) { setNewPin(""); }
  }

  return (
    <div className="stack">
      <SectionTitle>{data.players.length} players</SectionTitle>
      <Card><div className="card__body adminrow">
        <select className="select" style={{ width: 160 }} value={resetId} onChange={(e) => setResetId(e.target.value)}>
          <option value="">Reset passcode for…</option>
          {data.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="input" style={{ width: 180 }} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\s/g, "").slice(0, 20))} placeholder="new passcode" />
        <Button variant="ghost" className="btn--sm" onClick={resetPasscode} disabled={!resetId || newPin.length < 4}>Reset</Button>
        {resetMsg && <span className="muted" style={{ fontSize: 12 }}>{resetMsg}</span>}
      </div></Card>
      <Card className="lb"><div className="card__head">Tournament bonus picks</div>
        <table className="dtable">
          <thead><tr><th>Player</th><th>Champion</th><th>Runner-up</th><th>Golden Boot</th><th className="r">Pts</th></tr></thead>
          <tbody>
            {data.bonus.map((b, i) => <tr key={i}><td style={{ fontWeight: 800 }}>{b.player}</td><td>{b.champion ?? "—"}</td><td>{b.runnerUp ?? "—"}</td><td>{b.goldenBoot ?? "—"}</td><td className="r num">{b.points}</td></tr>)}
            {data.bonus.length === 0 && <tr><td colSpan={5} className="muted">No bonus picks yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card className="lb"><div className="card__head">Match predictions ({data.predictions.length})</div>
        <div style={{ maxHeight: 380, overflow: "auto" }}>
          <table className="dtable">
            <thead><tr><th>Player</th><th>Match</th><th className="c">Pick</th><th className="r">Pts</th></tr></thead>
            <tbody>
              {data.predictions.map((p, i) => <tr key={i}><td style={{ fontWeight: 800 }}>{p.player}</td><td className="muted">{p.match}</td><td className="c num">{p.homeScore}–{p.awayScore}</td><td className="r num">{p.points}</td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
