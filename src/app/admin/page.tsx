"use client";

import { useEffect, useState } from "react";
import {
  getJSON,
  postJSON,
  type StateResponse,
  type MatchDTO,
  type TeamDTO,
  type SettingsDTO,
} from "@/lib/client";
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
    const s = await getJSON<StateResponse>("/api/state");
    setState(s);
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Validate password via a protected endpoint.
    const res = await fetch(`/api/admin/overview?password=${encodeURIComponent(password)}`);
    if (!res.ok) return setError("Wrong admin password.");
    setUnlocked(true);
    loadState();
  }

  if (!unlocked) {
    return (
      <Card className="mx-auto max-w-sm p-6">
        <h1 className="text-lg font-bold text-slate-800">Admin</h1>
        <p className="mb-4 text-sm text-slate-500">Enter the shared admin password (from your environment).</p>
        <form onSubmit={unlock} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
          />
          {error && <Message kind="error">{error}</Message>}
          <Button type="submit" disabled={!password}>Unlock</Button>
        </form>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        {(["results", "scoring", "tools", "picks"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-2 capitalize transition ${tab === t ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}
          >
            {t === "picks" ? "Everyone's picks" : t}
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

// ---- Results override ----------------------------------------------------

function ResultsTab({ state, password, onChange }: { state: StateResponse; password: string; onChange: () => void }) {
  const [stage, setStage] = useState("GROUP");
  const matches = state.matches.filter((m) => m.stage === stage);
  return (
    <div className="space-y-3">
      <SectionTitle sub="Set scores/status manually (handy for testing, or when the API lags). Recomputes points instantly.">
        Enter / override results
      </SectionTitle>
      <select value={stage} onChange={(e) => setStage(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        {STAGE_ORDER.map((s) => (
          <option key={s} value={s}>{STAGE_LABEL[s]}</option>
        ))}
      </select>
      <div className="space-y-2">
        {matches.map((m) => (
          <ResultRow key={m.id} match={m} teams={state.teams} password={password} onSaved={onChange} />
        ))}
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
    setBusy(true);
    setSaved(false);
    const body: Record<string, unknown> = {
      password,
      matchId: match.id,
      status,
      homeScore: home === "" ? null : Number(home),
      awayScore: away === "" ? null : Number(away),
    };
    if (isKO) {
      body.homeTeamId = homeTeamId || null;
      body.awayTeamId = awayTeamId || null;
    }
    const res = await postJSON("/api/admin/result", body);
    setBusy(false);
    if (res.ok) { setSaved(true); onSaved(); }
  }

  return (
    <Card className="px-3 py-2">
      <div className="mb-1 text-xs text-slate-400">{formatKickoff(match.kickoff)}{match.group ? ` · Group ${match.group}` : ""}</div>
      <div className="flex flex-wrap items-center gap-2">
        {isKO ? (
          <TeamPicker value={homeTeamId} onChange={setHomeTeamId} teams={teams} placeholder={h.name} />
        ) : (
          <span className="w-32 truncate text-right text-sm">{h.flag} {h.name}</span>
        )}
        <input value={home} onChange={(e) => setHome(e.target.value.replace(/\D/g, "").slice(0, 2))} className="score h-8 w-10 rounded border border-slate-300 text-center" inputMode="numeric" />
        <span className="text-slate-300">:</span>
        <input value={away} onChange={(e) => setAway(e.target.value.replace(/\D/g, "").slice(0, 2))} className="score h-8 w-10 rounded border border-slate-300 text-center" inputMode="numeric" />
        {isKO ? (
          <TeamPicker value={awayTeamId} onChange={setAwayTeamId} teams={teams} placeholder={a.name} />
        ) : (
          <span className="w-32 truncate text-sm">{a.flag} {a.name}</span>
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-xs">
          <option value="SCHEDULED">Scheduled</option>
          <option value="LIVE">Live</option>
          <option value="FINISHED">Finished</option>
        </select>
        <Button onClick={save} disabled={busy} variant="ghost" className="ml-auto !py-1">
          {busy ? "…" : saved ? "✓ Saved" : "Save"}
        </Button>
      </div>
    </Card>
  );
}

function TeamPicker({ value, onChange, teams, placeholder }: { value: string; onChange: (v: string) => void; teams: TeamDTO[]; placeholder: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-32 rounded border border-slate-300 px-2 py-1 text-xs">
      <option value="">{placeholder}</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
      ))}
    </select>
  );
}

// ---- Scoring config ------------------------------------------------------

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
  const [vals, setVals] = useState<Record<string, number>>(() =>
    Object.fromEntries(POINT_FIELDS.map((f) => [f.key, settings[f.key] as number])),
  );
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
    <div className="space-y-3">
      <SectionTitle sub="Change any point value; the leaderboard recomputes immediately.">Scoring configuration</SectionTitle>
      <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        {POINT_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-xs font-medium text-slate-500">{f.label}</label>
            <input
              type="number"
              value={vals[f.key]}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: Number(e.target.value) }))}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        ))}
      </Card>
      <Card className="p-4">
        <label className="mb-1 block text-xs font-medium text-slate-500">Actual Golden Boot winner (for bonus scoring)</label>
        <input value={goldenBoot} onChange={(e) => setGoldenBoot(e.target.value)} placeholder="Player name" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </Card>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save scoring"}</Button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

// ---- Tools ---------------------------------------------------------------

function ToolsTab({ password, onChange }: { password: string; onChange: () => void }) {
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(path: string, label: string) {
    setBusy(label);
    setOut(null);
    const res = await postJSON<Record<string, unknown>>(path, { password });
    setBusy(null);
    setOut(res.ok ? JSON.stringify(res.data) : `Error: ${"error" in res ? res.error : ""}`);
    if (res.ok) onChange();
  }

  return (
    <div className="space-y-3">
      <SectionTitle sub="Sync from the live API on demand, or rebuild the fixture list from the bundled dataset.">Tools</SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run("/api/admin/sync", "sync")} disabled={!!busy}>
            {busy === "sync" ? "Syncing…" : "Force live sync"}
          </Button>
          <Button variant="ghost" onClick={() => run("/api/admin/seed", "seed")} disabled={!!busy}>
            {busy === "seed" ? "Seeding…" : "Re-seed fixtures"}
          </Button>
        </div>
        {out && <pre className="overflow-auto rounded bg-slate-900 p-3 text-xs text-emerald-300">{out}</pre>}
        <p className="text-xs text-slate-400">Live sync needs FOOTBALL_API_KEY set; otherwise it reports skipped.</p>
      </Card>
    </div>
  );
}

// ---- Everyone's picks ----------------------------------------------------

type Overview = {
  players: { id: string; name: string; createdAt: string }[];
  predictions: { player: string; match: string; stage: string; homeScore: number; awayScore: number; points: number }[];
  bracket: { player: string; round: string; team: string; points: number }[];
  bonus: { player: string; champion: string | null; runnerUp: string | null; goldenBoot: string | null; points: number }[];
};

function PicksTab({ password }: { password: string }) {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => {
    getJSON<Overview>(`/api/admin/overview?password=${encodeURIComponent(password)}`).then(setData).catch(() => {});
  }, [password]);
  if (!data) return <Spinner />;

  return (
    <div className="space-y-4">
      <SectionTitle>{data.players.length} players</SectionTitle>
      <Card className="p-4">
        <h3 className="mb-2 font-bold text-slate-700">Tournament bonus picks</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr><th className="py-1">Player</th><th>Champion</th><th>Runner-up</th><th>Golden Boot</th><th className="text-right">Pts</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.bonus.map((b, i) => (
              <tr key={i}><td className="py-1 font-medium">{b.player}</td><td>{b.champion ?? "—"}</td><td>{b.runnerUp ?? "—"}</td><td>{b.goldenBoot ?? "—"}</td><td className="text-right">{b.points}</td></tr>
            ))}
            {data.bonus.length === 0 && <tr><td colSpan={5} className="py-2 text-slate-400">No bonus picks yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card className="p-4">
        <h3 className="mb-2 font-bold text-slate-700">Match predictions ({data.predictions.length})</h3>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs uppercase text-slate-400">
              <tr><th className="py-1">Player</th><th>Match</th><th>Pick</th><th className="text-right">Pts</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.predictions.map((p, i) => (
                <tr key={i}><td className="py-1 font-medium">{p.player}</td><td className="text-slate-500">{p.match}</td><td>{p.homeScore}–{p.awayScore}</td><td className="text-right">{p.points}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
