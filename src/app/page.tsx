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
import { Ball } from "@/components/icons";
import { Countdown } from "@/components/Countdown";

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

function Hero({ nextKickoff }: { nextKickoff?: string }) {
  return (
    <div className="hero">
      <div className="h-kick">
        <Ball className="ic-svg" /> Jun 11 – Jul 19 · 48 teams · 104 games
      </div>
      <h1>
        <span className="l1">World Cup</span>
        <span className="l2">2026</span>
      </h1>
      <p className="h-sub">
        Predict every scoreline, call the knockout bracket, and back your champion. Score points,
        climb the office table, win the bragging rights.
      </p>
      {nextKickoff && (
        <>
          <div style={{ marginTop: 16, fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", opacity: 0.92 }}>
            Next kickoff in
          </div>
          <Countdown to={nextKickoff} />
        </>
      )}
    </div>
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
    if (!/^[!-~]{4,20}$/.test(pin)) return setError("Passcode must be 4–20 characters, no spaces.");
    setBusy(true);
    const res = await postJSON<{ id: string; name: string }>("/api/players/join", { name, pin });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPlayer({ id: res.data.id, name: res.data.name, pin });
    onJoined(res.data.name);
  }

  return (
    <div className="stack">
      <Hero />
      <Card>
        <div className="card__body" style={{ maxWidth: 420, margin: "0 auto", width: "100%" }}>
          <h2 className="disp" style={{ fontSize: 21 }}>Join the pool</h2>
          <p className="muted" style={{ fontSize: 13, margin: "4px 0 16px" }}>
            Pick a name and a passcode. Use the same two to come back later — the passcode keeps others
            from editing your picks (light protection, not real security).
          </p>
          <form onSubmit={submit} className="stack-sm">
            <div className="field">
              <label>Your name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Marcin" />
            </div>
            <div className="field">
              <label>Passcode</label>
              <input
                className="input"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\s/g, "").slice(0, 20))}
                placeholder="a word, numbers or symbols you'll remember"
                autoComplete="off"
              />
              <div className="hint">4–20 characters — letters, numbers or symbols · remembered on this device</div>
            </div>
            {error && <Message kind="error">{error}</Message>}
            <Button type="submit" className="btn--lg" disabled={busy || !name || pin.length < 4}>
              {busy ? "Joining…" : "Join / Sign in"}
            </Button>
          </form>
        </div>
      </Card>
    </div>
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
  const openGroup = state.matches.filter((m) => m.stage === "GROUP" && !m.locked);
  const predictedOpen = openGroup.filter((m) => state.me?.predictions[m.id]).length;
  const myRow = live?.leaderboard.find((r) => r.playerId === player.id);
  const rank = myRow ? live!.leaderboard.findIndex((r) => r.playerId === player.id) + 1 : null;
  const liveCount = live?.matches.filter((m) => m.status === "LIVE").length ?? 0;
  const nextMatch = open[0];

  return (
    <div className="stack">
      <Hero nextKickoff={nextMatch?.kickoff} />

      <div className="stats">
        <div className="stat is-accent">
          <div className="l">Your points</div>
          <div className="v num">{myRow ? myRow.total : 0}</div>
        </div>
        <div className="stat">
          <div className="l">Your rank</div>
          <div className="v num">{rank ? <>#{rank}<small> / {live!.leaderboard.length}</small></> : "—"}</div>
        </div>
        <div className="stat">
          <div className="l">Group games</div>
          <div className="v num">{predictedOpen}<small>/{openGroup.length}</small></div>
        </div>
      </div>

      <Card>
        <div className="card__body">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2 className="disp" style={{ fontSize: 21 }}>Welcome back, {player.name}</h2>
              {nextMatch ? (
                <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  Next up: <b style={{ color: "var(--ink)" }}>{nextMatch.home?.name ?? nextMatch.homeLabel} v {nextMatch.away?.name ?? nextMatch.awayLabel}</b> · {new Date(nextMatch.kickoff).toLocaleString()}
                </p>
              ) : (
                <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>The tournament is underway — check the table!</p>
              )}
            </div>
            {liveCount > 0 && (
              <span className="chip chip--grass"><span className="live-dot" /> Matchday live</span>
            )}
          </div>
          <div className="row wrap mt">
            <Link href="/predict"><Button>Make / update predictions</Button></Link>
            <Link href="/matches"><Button variant="ghost">Live matches</Button></Link>
            <Link href="/leaderboard"><Button variant="ghost">Leaderboard</Button></Link>
          </div>
        </div>
      </Card>

      <ChangePasscode />

      <div className="center">
        <button className="signout" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}

function ChangePasscode() {
  const player = getPlayer();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  if (!player) return null;

  async function save() {
    if (!player) return;
    if (!/^[!-~]{4,20}$/.test(next)) return setMsg({ kind: "error", text: "New passcode must be 4–20 characters, no spaces." });
    setBusy(true);
    const res = await postJSON("/api/players/passcode", { playerId: player.id, pin: cur, newPin: next });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error });
    setPlayer({ ...player, pin: next });
    setCur(""); setNext("");
    setMsg({ kind: "success", text: "Passcode changed." });
  }

  return (
    <details>
      <summary className="signout" style={{ cursor: "pointer", listStyle: "none" }}>Change passcode</summary>
      <Card className="mt">
        <div className="card__body stack-sm" style={{ maxWidth: 360 }}>
          <div className="field">
            <label>Current passcode</label>
            <input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label>New passcode</label>
            <input className="input" value={next} onChange={(e) => setNext(e.target.value.replace(/\s/g, "").slice(0, 20))} autoComplete="off" />
          </div>
          {msg && <Message kind={msg.kind}>{msg.text}</Message>}
          <Button onClick={save} disabled={busy || !cur || next.length < 4}>{busy ? "Saving…" : "Change passcode"}</Button>
        </div>
      </Card>
    </details>
  );
}
