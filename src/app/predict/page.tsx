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
} from "@/lib/client";
import { Card, Button, Message, Spinner, SectionTitle } from "@/components/ui";
import { Flag } from "@/components/Flag";
import { BracketBoard } from "@/components/BracketBoard";
import { Combobox } from "@/components/Combobox";
import { GOLDEN_BOOT_CANDIDATES } from "@/lib/goldenBoot";
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
  const [jokerIds, setJokerIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const init: Record<string, { home: string; away: string }> = {};
    for (const [id, p] of Object.entries(state.me?.predictions ?? {})) {
      init[id] = { home: String(p.homeScore), away: String(p.awayScore) };
    }
    setEdits(init);
    setJokerIds(state.me?.jokerMatchIds ?? []);
  }, [state]);

  const sections = useMemo(() => matchdaySections(state.matches), [state.matches]);

  function setScore(id: string, side: "home" | "away", value: string) {
    const v = value.replace(/\D/g, "").slice(0, 2);
    setEdits((e) => ({ ...e, [id]: { home: e[id]?.home ?? "", away: e[id]?.away ?? "", [side]: v } }));
  }

  async function toggleJoker(matchId: string) {
    const player = getPlayer();
    if (!player) return;
    const res = await postJSON<{ jokerMatchIds: string[] }>("/api/joker", { playerId: player.id, pin: player.pin, matchId });
    if (!res.ok) return setMsg({ kind: "error", text: res.error });
    setJokerIds(res.data.jokerMatchIds);
    setMsg({ kind: "success", text: "⭐ Joker updated!" });
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
        ⭐ <b>Joker:</b> one per matchday — star a match to multiply its points ×{state.settings.jokerMultiplier} (a wrong joker costs {state.settings.jokerPenalty}). Knockout jokers are in the Bracket tab.
      </Message>

      <div className="stack mt">
        {sections.map((sec) => {
          const jokerMatch = sec.matches.find((m) => jokerIds.includes(m.id));
          return (
            <Card key={sec.key} className="overflow-hidden">
              <div className="grouphead">
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="gp">{sec.md}</span> Matchday {sec.md}
                </span>
                {jokerMatch ? (
                  <span
                    className="chip"
                    title={`Your joker this matchday: ${sideOf(jokerMatch, "home").name} v ${sideOf(jokerMatch, "away").name}`}
                    style={{ display: "inline-block", maxWidth: "62%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    ⭐ {sideOf(jokerMatch, "home").name} v {sideOf(jokerMatch, "away").name}
                  </span>
                ) : (
                  <span className="chip chip--ghost">⭐ 1 joker — tap a star</span>
                )}
              </div>
              <div>
                {sec.matches.map((m) => (
                  <ScoreRow
                    key={m.id}
                    match={m}
                    group={m.group}
                    value={edits[m.id]}
                    onChange={(side, v) => setScore(m.id, side, v)}
                    isJoker={jokerIds.includes(m.id)}
                    onToggleJoker={() => toggleJoker(m.id)}
                  />
                ))}
              </div>
            </Card>
          );
        })}
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

function ScoreRow({ match, group, value, onChange, isJoker, onToggleJoker }: {
  match: MatchDTO;
  group?: string | null;
  value?: { home: string; away: string };
  onChange: (side: "home" | "away", v: string) => void;
  isJoker: boolean;
  onToggleJoker: () => void;
}) {
  const home = sideOf(match, "home");
  const away = sideOf(match, "away");
  return (
    <div className={`prow${isJoker ? " is-joker" : ""}`}>
      {group && <span className="rgrp" title={`Group ${group}`}>{group}</span>}
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

type Section = { key: string; md: number; matches: MatchDTO[] };
// Group stage organized BY MATCHDAY — each matchday is one joker round, so the
// games you can joker against each other sit together. Within a matchday they're
// ordered by group. (Knockouts are predicted in the Bracket tab.)
function matchdaySections(matches: MatchDTO[]): Section[] {
  const group = matches.filter((m) => m.stage === "GROUP");
  return [1, 2, 3]
    .map((md) => ({
      key: `MD${md}`,
      md,
      matches: group
        .filter((m) => m.matchday === md)
        .sort(
          (a, b) =>
            (a.group ?? "").localeCompare(b.group ?? "") ||
            new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
        ),
    }))
    .filter((s) => s.matches.length > 0);
}

// ---- Bracket -------------------------------------------------------------

function BracketTab({ state, onSaved }: { state: StateResponse; onSaved: () => Promise<void> }) {
  const status = state.settings.bracketStatus;
  const editable = state.settings.bracketOpen;
  const [jokerIds, setJokerIds] = useState<string[]>([]);
  useEffect(() => { setJokerIds(state.me?.jokerMatchIds ?? []); }, [state]);

  async function handleSave(picks: Record<string, string[]>, scores: { matchId: string; homeScore: number; awayScore: number }[]) {
    const player = getPlayer();
    if (!player) return { ok: false as const, error: "Not signed in." };
    const a = await postJSON("/api/bracket", { playerId: player.id, pin: player.pin, picks });
    if (!a.ok) return { ok: false as const, error: a.error };
    if (scores.length) {
      const b = await postJSON("/api/predictions", { playerId: player.id, pin: player.pin, predictions: scores });
      if (!b.ok) return { ok: false as const, error: b.error };
    }
    await onSaved();
    return { ok: true as const };
  }

  async function toggleJoker(matchId: string) {
    const player = getPlayer();
    if (!player) return;
    const res = await postJSON<{ jokerMatchIds: string[] }>("/api/joker", { playerId: player.id, pin: player.pin, matchId });
    if (res.ok) setJokerIds(res.data.jokerMatchIds);
  }

  return (
    <div className="stack">
      <SectionTitle sub="Pick who advances and predict each tie's score — each tie locks at its own kickoff, so you can keep editing the rounds that haven't started. ⭐ one joker per round (R32→SF) doubles a tie's points.">
        Knockout bracket
      </SectionTitle>
      {status === "PENDING_GROUPS" && (
        <Message kind="info">
          🔒 The bracket opens once the group stage is over
          {state.settings.groupStageEnd ? ` (around ${new Date(state.settings.groupStageEnd).toLocaleDateString()})` : ""} —
          the 32 qualified teams drop in, then you advance them and call the scores. After that, each tie stays editable
          right up to its own kickoff.
        </Message>
      )}
      <Card><div className="card__body"><BracketBoard matches={state.matches} saved={state.me?.bracket ?? {}} predictions={state.me?.predictions ?? {}} editable={editable} jokerIds={jokerIds} onToggleJoker={toggleJoker} onSave={handleSave} /></div></Card>
      <p className="muted center" style={{ fontSize: 12 }}>
        Knockout ties score just like the group stage — {state.settings.pointsExact} pts exact / {state.settings.pointsResult} pt result. No bonus for picking who advances; your ⭐ joker still doubles a tie.
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

  const teamOpts = [...state.teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ value: t.id, label: t.name, iso2: t.iso2 }));
  const candidateOpts = GOLDEN_BOOT_CANDIDATES.map((c) => ({ value: c.name, label: c.name, sub: c.team }));

  return (
    <div className="stack">
      <SectionTitle sub="One-off calls for the whole tournament. Lock at the first kickoff.">Tournament bonuses</SectionTitle>
      {locked && <Message kind="info">🔒 Bonus picks are locked — the tournament has started.</Message>}
      <Card>
        <div className="card__body stack-sm">
          <div className="field">
            <label>Champion · +{state.settings.bonusTournamentChampion} pts</label>
            <Combobox value={champion} onChange={setChampion} options={teamOpts} placeholder="Pick a team" disabled={locked} />
          </div>
          <div className="field">
            <label>Runner-up · +{state.settings.bonusRunnerUp} pts</label>
            <Combobox value={runnerUp} onChange={setRunnerUp} options={teamOpts} placeholder="Pick a team" disabled={locked} />
          </div>
          <div className="field">
            <label>Golden Boot (top scorer) · +{state.settings.bonusGoldenBoot} pts</label>
            <Combobox value={golden} onChange={setGolden} options={candidateOpts} placeholder="Search a player, or type any name" allowCustom disabled={locked} />
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

