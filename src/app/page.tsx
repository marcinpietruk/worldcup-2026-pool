"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getPlayer,
  setPlayer,
  clearPlayer,
  postJSON,
  getJSON,
  fetchState,
  type StateResponse,
  type LiveResponse,
} from "@/lib/client";
import { Card, Button, Message, Spinner } from "@/components/ui";

export default function HomePage() {
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPlayerName(getPlayer()?.name ?? null);
    setReady(true);
  }, []);

  if (!ready) return <Spinner />;
  return playerName ? (
    <Dashboard onSignOut={() => { clearPlayer(); setPlayerName(null); }} />
  ) : (
    <Join onJoined={(name) => setPlayerName(name)} />
  );
}

function Join({ onJoined }: { onJoined: (name: string) => void }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(pin)) return setError("PIN must be exactly 4 digits.");
    setBusy(true);
    const res = await postJSON<{ id: string; name: string }>("/api/players/join", { name, pin });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPlayer({ id: res.data.id, name: res.data.name, pin });
    onJoined(res.data.name);
  }

  return (
    <div className="space-y-6">
      <Hero />
      <Card className="p-6 max-w-md mx-auto">
        <h2 className="text-lg font-bold text-slate-800">Join the pool</h2>
        <p className="mb-4 text-sm text-slate-500">
          Pick a name and a 4-digit PIN. Use the same two to come back later — the PIN keeps others
          from editing your picks (it&apos;s light protection, not real security).
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="e.g. Marcin"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">4-digit PIN</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="••••"
              className="score w-28 rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-emerald-500"
            />
          </div>
          {error && <Message kind="error">{error}</Message>}
          <Button type="submit" disabled={busy || !name || pin.length !== 4}>
            {busy ? "Joining…" : "Join / Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Hero() {
  return (
    <Card className="overflow-hidden border-0">
      <div className="pitch-stripes px-6 py-10 text-white">
        <div className="text-5xl">🏆⚽</div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Office World Cup 2026 Pool
        </h1>
        <p className="mt-2 max-w-xl text-white/90">
          Predict every match, call the knockout bracket, and back your champion. Score points, climb
          the office table, win the bragging rights. 48 teams, 104 games, one winner among us.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-white/15 px-3 py-1">3 pts exact score</span>
          <span className="rounded-full bg-white/15 px-3 py-1">1 pt right result</span>
          <span className="rounded-full bg-white/15 px-3 py-1">Bonus bracket + champion</span>
        </div>
      </div>
    </Card>
  );
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const player = getPlayer();
  const [state, setState] = useState<StateResponse | null>(null);
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!player) return;
    fetchState(player).then(setState).catch((e) => setErr(String(e)));
    getJSON<LiveResponse>("/api/live").then(setLive).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!player) return null;
  if (err) return <Message kind="error">{err}</Message>;
  if (!state) return <Spinner />;

  const open = state.matches.filter((m) => !m.locked);
  const predictedOpen = open.filter((m) => state.me?.predictions[m.id]).length;
  const myRow = live?.leaderboard.find((r) => r.playerId === player.id);
  const rank = myRow ? live!.leaderboard.findIndex((r) => r.playerId === player.id) + 1 : null;
  const nextMatch = open[0];

  return (
    <div className="space-y-5">
      <Hero />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Your points" value={myRow ? myRow.total : 0} accent />
        <Stat label="Your rank" value={rank ? `#${rank} of ${live!.leaderboard.length}` : "—"} />
        <Stat label="Open matches predicted" value={`${predictedOpen} / ${open.length}`} />
      </div>

      <Card className="p-5">
        <h2 className="text-lg font-bold text-slate-800">Welcome back, {player.name} 👋</h2>
        {nextMatch ? (
          <p className="mt-1 text-sm text-slate-500">
            Next up: {nextMatch.home?.name ?? nextMatch.homeLabel} vs{" "}
            {nextMatch.away?.name ?? nextMatch.awayLabel} ·{" "}
            {new Date(nextMatch.kickoff).toLocaleString()}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">The tournament is underway — check the table!</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/predict"><Button>Make / update predictions</Button></Link>
          <Link href="/matches"><Button variant="ghost">Live matches</Button></Link>
          <Link href="/leaderboard"><Button variant="ghost">Leaderboard</Button></Link>
        </div>
      </Card>

      <button onClick={onSignOut} className="text-sm text-slate-400 underline hover:text-slate-600">
        Sign out
      </button>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className={`p-4 ${accent ? "ring-2 ring-emerald-500/30" : ""}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${accent ? "text-emerald-600" : "text-slate-800"}`}>
        {value}
      </div>
    </Card>
  );
}
