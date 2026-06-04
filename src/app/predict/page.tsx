"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getPlayer,
  fetchState,
  postJSON,
  type StateResponse,
  type MatchDTO,
  type TeamDTO,
} from "@/lib/client";
import { Card, Button, Message, Spinner, SectionTitle } from "@/components/ui";
import { BracketBoard } from "@/components/BracketBoard";
import { STAGE_LABEL, STAGE_ORDER, formatKickoff, sideOf } from "@/lib/format";

type Tab = "matches" | "bracket" | "bonus";

export default function PredictPage() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("matches");
  const [hasPlayer, setHasPlayer] = useState<boolean | null>(null);

  async function reload() {
    const p = getPlayer();
    if (!p) return;
    const s = await fetchState(p);
    setState(s);
  }

  useEffect(() => {
    const p = getPlayer();
    setHasPlayer(!!p);
    if (p) reload().catch((e) => setErr(String(e)));
  }, []);

  if (hasPlayer === false)
    return (
      <Message kind="info">
        You need to join first. <Link href="/" className="underline font-medium">Go to the join page →</Link>
      </Message>
    );
  if (err) return <Message kind="error">{err}</Message>;
  if (!state) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        {(["matches", "bracket", "bonus"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-2 capitalize transition ${
              tab === t ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"
            }`}
          >
            {t === "matches" ? "Match scores" : t}
          </button>
        ))}
      </div>

      {tab === "matches" && <MatchesTab state={state} onSaved={reload} />}
      {tab === "bracket" && <BracketTab state={state} onSaved={reload} />}
      {tab === "bonus" && <BonusTab state={state} onSaved={reload} />}
    </div>
  );
}

// ---- Match score predictions --------------------------------------------

function MatchesTab({ state, onSaved }: { state: StateResponse; onSaved: () => Promise<void> }) {
  const [edits, setEdits] = useState<Record<string, { home: string; away: string }>>({});
  const [joker, setJokerState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Seed local edit state from saved predictions.
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
    const res = await postJSON<{ jokerMatchId: string | null }>("/api/joker", {
      playerId: player.id,
      pin: player.pin,
      matchId: next,
    });
    if (!res.ok) return setMsg({ kind: "error", text: res.error });
    setJokerState(next);
    setMsg({ kind: "success", text: next ? "⭐ Joker set on this match!" : "Joker cleared." });
  }

  async function save() {
    const player = getPlayer();
    if (!player) return;
    const predictions = Object.entries(edits)
      .filter(([id, v]) => v.home !== "" && v.away !== "" && !state.matches.find((m) => m.id === id)?.locked)
      .map(([matchId, v]) => ({ matchId, homeScore: Number(v.home), awayScore: Number(v.away) }));
    if (predictions.length === 0) return setMsg({ kind: "error", text: "Nothing to save yet." });
    setBusy(true);
    const res = await postJSON<{ saved: number; rejected: string[] }>("/api/predictions", {
      playerId: player.id,
      pin: player.pin,
      predictions,
    });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error });
    setMsg({
      kind: "success",
      text: `Saved ${res.data.saved} prediction${res.data.saved === 1 ? "" : "s"}.${
        res.data.rejected.length ? ` ${res.data.rejected.length} skipped (locked).` : ""
      }`,
    });
    await onSaved();
  }

  return (
    <div className="space-y-5 pb-24">
      <SectionTitle sub={`${state.settings.pointsExact} pts exact score · ${state.settings.pointsResult} pt right result · predictions lock at kickoff`}>
        Predict every scoreline
      </SectionTitle>

      <Message kind="info">
        ⭐ <b>Joker:</b> tap a star to double that match&apos;s points (×{state.settings.jokerMultiplier}) — but a
        wrong joker costs you {state.settings.jokerPenalty}. One at a time; move it until that match kicks off.
      </Message>

      {sections.map((sec) => (
        <Card key={sec.key} className="overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600">
            {sec.title}
          </div>
          <div className="divide-y divide-slate-100">
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

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          {msg ? (
            <span className={`text-sm ${msg.kind === "success" ? "text-emerald-600" : "text-rose-600"}`}>
              {msg.text}
            </span>
          ) : (
            <span className="text-sm text-slate-400">Fill in scores, then save.</span>
          )}
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save predictions"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ScoreRow({
  match,
  value,
  onChange,
  isJoker,
  onToggleJoker,
}: {
  match: MatchDTO;
  value?: { home: string; away: string };
  onChange: (side: "home" | "away", v: string) => void;
  isJoker: boolean;
  onToggleJoker: () => void;
}) {
  const home = sideOf(match, "home");
  const away = sideOf(match, "away");
  const finished = match.status === "FINISHED";
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 ${isJoker ? "bg-amber-50" : ""}`}>
      <div className="hidden w-24 shrink-0 text-xs text-slate-400 sm:block">{formatKickoff(match.kickoff)}</div>
      <TeamName flag={home.flag} name={home.name} faded={home.faded} align="right" />
      <div className="flex items-center gap-1">
        <ScoreInput value={value?.home ?? ""} onChange={(v) => onChange("home", v)} disabled={match.locked} />
        <span className="text-slate-300">:</span>
        <ScoreInput value={value?.away ?? ""} onChange={(v) => onChange("away", v)} disabled={match.locked} />
      </div>
      <TeamName flag={away.flag} name={away.name} faded={away.faded} align="left" />
      <div className="ml-auto flex shrink-0 items-center gap-1.5 text-right text-xs">
        {finished && (
          <span className="font-semibold text-slate-500">{match.homeScore}-{match.awayScore}</span>
        )}
        {match.locked ? (
          isJoker ? (
            <span title="Your joker (locked in)" className="text-base">⭐</span>
          ) : (
            <span className="text-slate-300">🔒</span>
          )
        ) : (
          <button
            type="button"
            onClick={onToggleJoker}
            title={isJoker ? "Remove joker" : "Joker this match"}
            className={`text-base leading-none transition ${isJoker ? "" : "opacity-25 hover:opacity-60"}`}
          >
            {isJoker ? "⭐" : "☆"}
          </button>
        )}
      </div>
    </div>
  );
}

function TeamName({ flag, name, faded, align }: { flag: string; name: string; faded: boolean; align: "left" | "right" }) {
  return (
    <div className={`flex flex-1 items-center gap-1.5 ${align === "right" ? "justify-end text-right" : "justify-start"}`}>
      {align === "right" && <span className={`truncate text-sm ${faded ? "italic text-slate-400" : "text-slate-700"}`}>{name}</span>}
      <span className="text-lg">{flag || "🏳️"}</span>
      {align === "left" && <span className={`truncate text-sm ${faded ? "italic text-slate-400" : "text-slate-700"}`}>{name}</span>}
    </div>
  );
}

function ScoreInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      inputMode="numeric"
      placeholder="–"
      className="score h-9 w-9 rounded-md border border-slate-300 text-center text-sm font-semibold outline-none focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
    />
  );
}

type Section = { key: string; title: string; matches: MatchDTO[] };
function groupMatches(matches: MatchDTO[]): Section[] {
  const sections: Section[] = [];
  // Group stage split by group letter.
  const groups = [...new Set(matches.filter((m) => m.stage === "GROUP").map((m) => m.group))]
    .filter(Boolean)
    .sort() as string[];
  for (const g of groups) {
    sections.push({
      key: `G${g}`,
      title: `Group ${g}`,
      matches: matches.filter((m) => m.stage === "GROUP" && m.group === g),
    });
  }
  // Knockout stages.
  for (const stage of STAGE_ORDER.filter((s) => s !== "GROUP")) {
    const ms = matches.filter((m) => m.stage === stage);
    if (ms.length) sections.push({ key: stage, title: STAGE_LABEL[stage], matches: ms });
  }
  return sections;
}

// ---- Knockout bracket (graphical board) ---------------------------------

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
    <div className="space-y-4">
      <SectionTitle sub="Tap a team to send it through the knockouts — your pick flows into the next round. Bonus points for each team you correctly advance.">
        Knockout bracket
      </SectionTitle>
      {status === "PENDING_GROUPS" && (
        <Message kind="info">
          🔒 The bracket opens once the group stage is over
          {state.settings.groupStageEnd ? ` (around ${new Date(state.settings.groupStageEnd).toLocaleDateString()})` : ""} —
          the 32 qualified teams drop into the slots below, then you tap to advance them.
        </Message>
      )}
      {status === "CLOSED" && <Message kind="info">🔒 Bracket picks are locked — the knockout stage has started.</Message>}

      <Card className="p-3">
        <BracketBoard matches={state.matches} saved={state.me?.bracket ?? {}} editable={editable} onSave={handleSave} />
      </Card>

      <p className="text-xs text-slate-400">
        Bonus per correct team — R16 +{state.settings.bonusR16}, QF +{state.settings.bonusQF}, SF +{state.settings.bonusSF}, Final +{state.settings.bonusFinal}, Champion +{state.settings.bonusChampion}.
      </p>
    </div>
  );
}

// ---- Tournament bonus picks ---------------------------------------------

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
    const res = await postJSON("/api/bonus", {
      playerId: player.id,
      pin: player.pin,
      championTeamId: champion || null,
      runnerUpTeamId: runnerUp || null,
      goldenBoot: golden || null,
    });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error });
    setMsg({ kind: "success", text: "Bonus picks saved." });
    await onSaved();
  }

  return (
    <div className="space-y-4">
      <SectionTitle sub="One-off calls for the whole tournament. Locks at the first kickoff.">
        Tournament bonuses
      </SectionTitle>
      {locked && <Message kind="info">🔒 Bonus picks are locked — the tournament has started.</Message>}

      <Card className="space-y-4 p-5">
        <BonusSelect label={`Champion · +${state.settings.bonusTournamentChampion} pts`} value={champion} onChange={setChampion} teams={state.teams} disabled={locked} />
        <BonusSelect label={`Runner-up · +${state.settings.bonusRunnerUp} pts`} value={runnerUp} onChange={setRunnerUp} teams={state.teams} disabled={locked} />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Golden Boot (top scorer) · +{state.settings.bonusGoldenBoot} pts</label>
          <input
            value={golden}
            onChange={(e) => setGolden(e.target.value)}
            disabled={locked}
            placeholder="Player name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500 disabled:bg-slate-100"
          />
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy || locked}>{busy ? "Saving…" : "Save bonuses"}</Button>
        {msg && <span className={`text-sm ${msg.kind === "success" ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

function BonusSelect({ label, value, onChange, teams, disabled }: { label: string; value: string; onChange: (v: string) => void; teams: TeamDTO[]; disabled?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500 disabled:bg-slate-100"
      >
        <option value="">— pick a team —</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
        ))}
      </select>
    </div>
  );
}

