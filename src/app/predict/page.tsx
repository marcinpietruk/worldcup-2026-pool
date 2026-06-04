"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Star, Lock } from "lucide-react";
import {
  getPlayer,
  fetchState,
  postJSON,
  type StateResponse,
  type MatchDTO,
  type TeamDTO,
} from "@/lib/client";
import { Card, Button, Message, Spinner, SectionTitle } from "@/components/ui";
import { Flag } from "@/components/Flag";
import { BracketBoard } from "@/components/BracketBoard";
import { formatKickoff, sideOf } from "@/lib/format";

type Tab = "matches" | "bracket" | "bonus";

export default function PredictPage() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("matches");
  const [hasPlayer, setHasPlayer] = useState<boolean | null>(null);

  async function reload() {
    const p = getPlayer();
    if (!p) return;
    setState(await fetchState(p));
  }

  useEffect(() => {
    const p = getPlayer();
    setHasPlayer(!!p);
    if (p) reload().catch((e) => setErr(String(e)));
  }, []);

  if (hasPlayer === false)
    return (
      <Message kind="info">
        You need to join first. <Link href="/" className="linkish">Go to the join page →</Link>
      </Message>
    );
  if (err) return <Message kind="error">{err}</Message>;
  if (!state) return <Spinner />;

  return (
    <div className="stack">
      <div className="tabs">
        {(["matches", "bracket", "bonus"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`tab${tab === t ? " active" : ""}`}>
            {t === "matches" ? "Match scores" : t === "bracket" ? "Bracket" : "Bonus"}
          </button>
        ))}
      </div>
      {tab === "matches" && <MatchesTab state={state} onSaved={reload} />}
      {tab === "bracket" && <BracketTab state={state} onSaved={reload} />}
      {tab === "bonus" && <BonusTab state={state} onSaved={reload} />}
    </div>
  );
}

// ---- Match scores --------------------------------------------------------

function MatchesTab({ state, onSaved }: { state: StateResponse; onSaved: () => Promise<void> }) {
  const [edits, setEdits] = useState<Record<string, { home: string; away: string }>>({});
  const [joker, setJokerState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const init: Record<string, { home: string; away: string }> = {};
    for (const [id, p] of Object.entries(state.me?.predictions ?? {})) {
      init[id] = { home: String(p.homeScore), away: String(p.awayScore) };
    }
    setEdits(init);
    setJokerState(state.me?.jokerMatchId ?? null);
  }, [state]);

  const sections = useMemo(() => groupMatches(state.matches), [state.matches]);

  function setScore(id: string, side: "home" | "away", value: string) {
    const v = value.replace(/\D/g, "").slice(0, 2);
    setEdits((e) => ({ ...e, [id]: { home: e[id]?.home ?? "", away: e[id]?.away ?? "", [side]: v } }));
  }

  async function toggleJoker(matchId: string) {
    const player = getPlayer();
    if (!player) return;
    const next = joker === matchId ? null : matchId;
    const res = await postJSON<{ jokerMatchId: string | null }>("/api/joker", { playerId: player.id, pin: player.pin, matchId: next });
    if (!res.ok) return setMsg({ kind: "error", text: res.error });
    setJokerState(next);
    setMsg({ kind: "success", text: next ? "⭐ Joker set!" : "Joker cleared." });
  }

  async function save() {
    const player = getPlayer();
    if (!player) return;
    const predictions = Object.entries(edits)
      .filter(([id, v]) => v.home !== "" && v.away !== "" && !state.matches.find((m) => m.id === id)?.locked)
      .map(([matchId, v]) => ({ matchId, homeScore: Number(v.home), awayScore: Number(v.away) }));
    if (predictions.length === 0) return setMsg({ kind: "error", text: "Nothing to save yet." });
    setBusy(true);
    const res = await postJSON<{ saved: number; rejected: string[] }>("/api/predictions", { playerId: player.id, pin: player.pin, predictions });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error });
    setMsg({ kind: "success", text: `Saved ${res.data.saved}.${res.data.rejected.length ? ` ${res.data.rejected.length} locked.` : ""}` });
    await onSaved();
  }

  return (
    <div style={{ paddingBottom: 8 }}>
      <SectionTitle sub={`Group stage · ${state.settings.pointsExact} pts exact · ${state.settings.pointsResult} pt result · locks at kickoff. Knockouts are in the Bracket tab.`}>
        Predict the group stage
      </SectionTitle>
      <Message kind="info">
        ⭐ <b>Joker:</b> star one match to multiply its points ×{state.settings.jokerMultiplier} — a wrong joker costs {state.settings.jokerPenalty}.
      </Message>

      <div className="stack mt">
        {sections.map((sec) => (
          <Card key={sec.key} className="overflow-hidden">
            <div className="grouphead">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {sec.group && <span className="gp">{sec.group}</span>}
                {sec.title}
              </span>
            </div>
            <div>
              {sec.matches.map((m) => (
                <ScoreRow
                  key={m.id}
                  match={m}
                  value={edits[m.id]}
                  onChange={(side, v) => setScore(m.id, side, v)}
                  isJoker={joker === m.id}
                  onToggleJoker={() => toggleJoker(m.id)}
                />
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="savebar">
        <span className="msgtext" style={{ color: msg?.kind === "error" ? "var(--bad-ink)" : msg?.kind === "success" ? "var(--good-ink)" : "var(--ink-soft)" }}>
          {msg ? msg.text : "Fill in scores, then save."}
        </span>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save predictions"}</Button>
      </div>
    </div>
  );
}

function ScoreRow({ match, value, onChange, isJoker, onToggleJoker }: {
  match: MatchDTO;
  value?: { home: string; away: string };
  onChange: (side: "home" | "away", v: string) => void;
  isJoker: boolean;
  onToggleJoker: () => void;
}) {
  const home = sideOf(match, "home");
  const away = sideOf(match, "away");
  return (
    <div className={`prow${isJoker ? " is-joker" : ""}`}>
      <div className="pwhen">{formatKickoff(match.kickoff)}</div>
      <div className="pteam r">
        <span className={`nm${home.faded ? " faded" : ""}`}>{home.name}</span>
        <Flag iso2={home.iso2} name={home.name} size="sm" />
      </div>
      <div className="sbox">
        <input className="sinp" value={value?.home ?? ""} onChange={(e) => onChange("home", e.target.value)} disabled={match.locked} inputMode="numeric" />
        <span className="colon">:</span>
        <input className="sinp" value={value?.away ?? ""} onChange={(e) => onChange("away", e.target.value)} disabled={match.locked} inputMode="numeric" />
      </div>
      <div className="pteam">
        <Flag iso2={away.iso2} name={away.name} size="sm" />
        <span className={`nm${away.faded ? " faded" : ""}`}>{away.name}</span>
      </div>
      {match.locked ? (
        isJoker ? <Star className="ic-svg lock" style={{ color: "var(--gold)" }} fill="currentColor" /> : <Lock className="ic-svg lock" style={{ color: "var(--ink-faint)" }} />
      ) : (
        <button className={`jbtn${isJoker ? "" : " off"}`} onClick={onToggleJoker} title={isJoker ? "Remove joker" : "Joker this match"} style={{ color: "var(--gold)" }}>
          <Star className="ic-svg" fill={isJoker ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}

type Section = { key: string; title: string; group: string | null; matches: MatchDTO[] };
// Only group-stage matches get a scoreline here — the knockout phase is predicted
// in the Bracket tab.
function groupMatches(matches: MatchDTO[]): Section[] {
  const groups = [...new Set(matches.filter((m) => m.stage === "GROUP").map((m) => m.group))].filter(Boolean).sort() as string[];
  return groups.map((g) => ({
    key: `G${g}`,
    title: `Group ${g}`,
    group: g,
    matches: matches.filter((m) => m.stage === "GROUP" && m.group === g),
  }));
}

// ---- Bracket -------------------------------------------------------------

function BracketTab({ state, onSaved }: { state: StateResponse; onSaved: () => Promise<void> }) {
  const status = state.settings.bracketStatus;
  const editable = state.settings.bracketOpen;

  async function handleSave(picks: Record<string, string[]>) {
    const player = getPlayer();
    if (!player) return { ok: false as const, error: "Not signed in." };
    const res = await postJSON("/api/bracket", { playerId: player.id, pin: player.pin, picks });
    if (res.ok) await onSaved();
    return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
  }

  return (
    <div className="stack">
      <SectionTitle sub="Tap a team to send it through the knockouts — your pick flows into the next round.">
        Knockout bracket
      </SectionTitle>
      {status === "PENDING_GROUPS" && (
        <Message kind="info">
          🔒 The bracket opens once the group stage is over
          {state.settings.groupStageEnd ? ` (around ${new Date(state.settings.groupStageEnd).toLocaleDateString()})` : ""} —
          the 32 qualified teams drop in, then you tap to advance them.
        </Message>
      )}
      {status === "CLOSED" && <Message kind="info">🔒 Bracket picks are locked — the knockouts have started.</Message>}
      <Card><div className="card__body"><BracketBoard matches={state.matches} saved={state.me?.bracket ?? {}} editable={editable} onSave={handleSave} /></div></Card>
      <p className="muted center" style={{ fontSize: 12 }}>
        Bonus per correct team — R16 +{state.settings.bonusR16}, QF +{state.settings.bonusQF}, SF +{state.settings.bonusSF}, Final +{state.settings.bonusFinal}, Champion +{state.settings.bonusChampion}.
      </p>
    </div>
  );
}

// ---- Bonus ---------------------------------------------------------------

function BonusTab({ state, onSaved }: { state: StateResponse; onSaved: () => Promise<void> }) {
  const [champion, setChampion] = useState("");
  const [runnerUp, setRunnerUp] = useState("");
  const [golden, setGolden] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const locked = state.settings.bonusLocked;

  useEffect(() => {
    setChampion(state.me?.bonus.championTeamId ?? "");
    setRunnerUp(state.me?.bonus.runnerUpTeamId ?? "");
    setGolden(state.me?.bonus.goldenBoot ?? "");
  }, [state]);

  async function save() {
    const player = getPlayer();
    if (!player) return;
    setBusy(true);
    const res = await postJSON("/api/bonus", { playerId: player.id, pin: player.pin, championTeamId: champion || null, runnerUpTeamId: runnerUp || null, goldenBoot: golden || null });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error });
    setMsg({ kind: "success", text: "Bonus picks saved." });
    await onSaved();
  }

  return (
    <div className="stack">
      <SectionTitle sub="One-off calls for the whole tournament. Lock at the first kickoff.">Tournament bonuses</SectionTitle>
      {locked && <Message kind="info">🔒 Bonus picks are locked — the tournament has started.</Message>}
      <Card>
        <div className="card__body stack-sm">
          <BonusSelect label={`Champion · +${state.settings.bonusTournamentChampion} pts`} value={champion} onChange={setChampion} teams={state.teams} disabled={locked} />
          <BonusSelect label={`Runner-up · +${state.settings.bonusRunnerUp} pts`} value={runnerUp} onChange={setRunnerUp} teams={state.teams} disabled={locked} />
          <div className="field">
            <label>Golden Boot (top scorer) · +{state.settings.bonusGoldenBoot} pts</label>
            <input className="input" value={golden} onChange={(e) => setGolden(e.target.value)} disabled={locked} placeholder="Player name" />
          </div>
        </div>
      </Card>
      <div className="row">
        <Button onClick={save} disabled={busy || locked}>{busy ? "Saving…" : "Save bonuses"}</Button>
        {msg && <span className="muted" style={{ fontSize: 13, color: msg.kind === "success" ? "var(--good-ink)" : "var(--bad-ink)" }}>{msg.text}</span>}
      </div>
    </div>
  );
}

function BonusSelect({ label, value, onChange, teams, disabled }: { label: string; value: string; onChange: (v: string) => void; teams: TeamDTO[]; disabled?: boolean }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">— pick a team —</option>
        {[...teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}
