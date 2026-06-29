"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MatchDTO, TeamDTO } from "@/lib/client";
import {
  bracketRounds,
  candidates,
  deriveRoundPicks,
  normalizeWinners,
  reconstructWinners,
  type KoStage,
} from "@/lib/bracket";
import { Trophy, Star, Shield } from "lucide-react";
import { Flag } from "./Flag";
import { Button } from "./ui";
import { formatKickoff } from "@/lib/format";

const STAGE_TITLE: Record<KoStage, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  FINAL: "Final",
};

// Short round tag for a not-yet-decided slot — the feeding round + the winner's
// position in it, ESPN-style: "RD32 W2", "RD16 W1", "QF W1".
const RD_LABEL: Record<string, string> = { R32: "RD32", R16: "RD16", QF: "QF", SF: "SF", FINAL: "Final" };

type Line = { left: number; top: number; width: number; height: number };
type ScoreEntry = { matchId: string; homeScore: number; awayScore: number };

export function BracketBoard({
  matches,
  saved,
  predictions,
  editable,
  jokerIds,
  onToggleJoker,
  onSave,
}: {
  matches: MatchDTO[];
  saved: Record<string, string[]>;
  predictions: Record<string, { homeScore: number; awayScore: number }>;
  editable: boolean;
  jokerIds: string[];
  onToggleJoker: (matchId: string) => void;
  onSave: (picks: Record<string, string[]>, scores: ScoreEntry[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const rounds = useMemo(() => bracketRounds(matches), [matches]);
  const byId = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const lockedByNum = useMemo(() => new Map(matches.map((m) => [m.number, m.locked])), [matches]);
  const teamById = useMemo(() => {
    const map = new Map<string, TeamDTO>();
    for (const m of matches) {
      if (m.home) map.set(m.home.id, m.home);
      if (m.away) map.set(m.away.id, m.away);
    }
    return map;
  }, [matches]);

  const [winners, setWinners] = useState<Record<number, string>>(() => reconstructWinners(saved, rounds));
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>(() => {
    const init: Record<string, { home: string; away: string }> = {};
    for (const [id, p] of Object.entries(predictions)) init[id] = { home: String(p.homeScore), away: String(p.awayScore) };
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const bracketRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);

  useLayoutEffect(() => {
    const cont = bracketRef.current;
    if (!cont) return;
    const draw = () => {
      const c = cont.getBoundingClientRect();
      const el = (num: number) => cont.querySelector<HTMLElement>(`[data-mb="${num}"]`);
      const next: Line[] = [];
      for (const round of rounds) {
        if (round.stage === "R32") continue;
        for (const m of round.matches) {
          const tEl = el(m.number);
          if (!tEl) continue;
          const t = tEl.getBoundingClientRect();
          const tx = t.left - c.left;
          const ty = t.top - c.top + t.height / 2;
          for (const fn of [m.sourceHomeNum, m.sourceAwayNum]) {
            if (fn == null) continue;
            const fEl = el(fn);
            if (!fEl) continue;
            const f = fEl.getBoundingClientRect();
            const fx = f.right - c.left;
            const fy = f.top - c.top + f.height / 2;
            const gx = fx + (tx - fx) / 2;
            next.push({ left: fx, top: fy, width: Math.max(0, gx - fx), height: 2 });
            next.push({ left: gx, top: Math.min(fy, ty), width: 2, height: Math.abs(ty - fy) });
            next.push({ left: gx, top: ty, width: Math.max(0, tx - gx), height: 2 });
          }
        }
      }
      setLines(next);
    };
    draw();
    const id = setTimeout(draw, 0);
    const ro = new ResizeObserver(draw);
    ro.observe(cont);
    if (document.fonts?.ready) document.fonts.ready.then(draw).catch(() => {});
    window.addEventListener("resize", draw);
    return () => { clearTimeout(id); ro.disconnect(); window.removeEventListener("resize", draw); };
  }, [rounds, winners]);

  function pick(matchNumber: number, teamId: string | null) {
    // A tie's "who advances" pick freezes at its own kickoff, like the group stage.
    if (!editable || !teamId || lockedByNum.get(matchNumber)) return;
    setWinners((prev) => normalizeWinners({ ...prev, [matchNumber]: teamId }, rounds));
    setMsg(null);
  }
  function setScore(matchId: string, side: "home" | "away", value: string) {
    const v = value.replace(/\D/g, "").slice(0, 2);
    setScores((s) => ({ ...s, [matchId]: { home: s[matchId]?.home ?? "", away: s[matchId]?.away ?? "", [side]: v } }));
  }

  // A not-yet-advanced slot reads as the round + winner that will fill it, e.g.
  // "RD32 W2" = winner of the 2nd Round-of-32 tie. Null for resolved/R32 slots.
  function progressionLabel(sourceNum: number | null): string | null {
    if (sourceNum == null) return null;
    const round = rounds.find((r) => r.matches.some((x) => x.number === sourceNum));
    if (!round) return null;
    const idx = round.matches.findIndex((x) => x.number === sourceNum) + 1;
    return `${RD_LABEL[round.stage] ?? round.stage} W${idx}`;
  }

  async function save() {
    setBusy(true);
    const scoreEntries: ScoreEntry[] = Object.entries(scores)
      .filter(([id, v]) => v.home !== "" && v.away !== "" && !byId.get(id)?.locked)
      .map(([matchId, v]) => ({ matchId, homeScore: Number(v.home), awayScore: Number(v.away) }));
    const res = await onSave(deriveRoundPicks(winners, rounds), scoreEntries);
    setBusy(false);
    setMsg({ ok: res.ok, text: res.ok ? "Bracket saved." : res.error ?? "Error" });
  }

  const finalNum = rounds.find((r) => r.stage === "FINAL")?.matches[0]?.number ?? -1;
  const champion = winners[finalNum] ? teamById.get(winners[finalNum]) : null;

  return (
    <div>
      <div className="bracket-scroll">
        <div className="bracket" ref={bracketRef}>
          <div className="bconn">{lines.map((l, i) => <i key={i} style={{ left: l.left, top: l.top, width: l.width, height: l.height }} />)}</div>

          {rounds.map((round) => (
            <div key={round.stage} className="bcol">
              <div className="bcol__h">{STAGE_TITLE[round.stage]}</div>
              {round.matches.map((m) => {
                const [hId, aId] = candidates(m, winners);
                const bothKnown = !!hId && !!aId;
                const isJoker = jokerIds.includes(m.id);
                const sc = scores[m.id];
                const canEdit = editable && !m.locked;
                const statusTag = m.status === "FINISHED" ? "FT" : m.status === "LIVE" ? (m.statusDetail ?? "LIVE") : null;
                return (
                  <div key={m.id} className="bmatch" data-mb={m.number}>
                    <div className="bmatch__hd">
                      <span className="bmatch__status">{statusTag}</span>
                      <span className="bmatch__num">Match {m.number}</span>
                    </div>
                    <Row
                      team={hId ? teamById.get(hId) : undefined}
                      label={progressionLabel(m.sourceHomeNum) ?? m.home?.name ?? m.homeLabel}
                      win={!!hId && winners[m.number] === hId}
                      clickable={canEdit && !!hId}
                      onClick={() => pick(m.number, hId)}
                      showScore={bothKnown}
                      editScore={canEdit && bothKnown}
                      score={sc?.home ?? ""}
                      onScore={(v) => setScore(m.id, "home", v)}
                    />
                    <Row
                      team={aId ? teamById.get(aId) : undefined}
                      label={progressionLabel(m.sourceAwayNum) ?? m.away?.name ?? m.awayLabel}
                      win={!!aId && winners[m.number] === aId}
                      clickable={canEdit && !!aId}
                      onClick={() => pick(m.number, aId)}
                      showScore={bothKnown}
                      editScore={canEdit && bothKnown}
                      score={sc?.away ?? ""}
                      onScore={(v) => setScore(m.id, "away", v)}
                    />
                    <div className="bmatch__ft">
                      <span className="bmatch__when">{formatKickoff(m.kickoff)}</span>
                      {canEdit && bothKnown ? (
                        <button type="button" className={`jstar${isJoker ? " on" : ""}`} onClick={() => onToggleJoker(m.id)} title={isJoker ? "Remove joker" : "Joker this tie"}>
                          <Star className="ic-svg" fill={isJoker ? "currentColor" : "none"} />
                        </button>
                      ) : (
                        isJoker && <span className="jstar on static" title="Your joker">⭐</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="bcol champ-col">
            <div className="bcol__h">Champion</div>
            <div className="champ-box">
              <div className={`cup${champion ? "" : " empty"}`}>
                {champion ? <Flag iso2={champion.iso2} name={champion.name} size="lg" /> : <Trophy className="ic-svg" />}
              </div>
              <div className="cn">{champion ? champion.name : "—"}</div>
              <div className="ck">Your champion</div>
            </div>
          </div>
        </div>
      </div>

      {editable && (
        <div className="row mt">
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save bracket"}</Button>
          {msg && <span className="muted" style={{ fontSize: 13, color: msg.ok ? "var(--good-ink)" : "var(--bad-ink)" }}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}

function Row({ team, label, win, clickable, onClick, showScore, editScore, score, onScore }: {
  team: TeamDTO | undefined;
  label: string | null | undefined;
  win: boolean;
  clickable: boolean;
  onClick: () => void;
  showScore: boolean;
  editScore: boolean;
  score: string;
  onScore: (v: string) => void;
}) {
  return (
    <div className={`brow${win ? " is-win" : ""}`}>
      <button type="button" className="brow__team" disabled={!clickable} onClick={onClick}>
        {team ? <Flag iso2={team.iso2} name={team.name} size="sm" /> : <Shield className="brow__shield" aria-hidden />}
        <span className={`brow__name${team ? "" : " tbd"}`}>{team?.name ?? label ?? "TBD"}</span>
      </button>
      {showScore &&
        (editScore ? (
          <input className="brow__sc brow__sc--inp" value={score} onChange={(e) => onScore(e.target.value)} inputMode="numeric" aria-label="score" />
        ) : (
          <span className="brow__sc">{score !== "" ? score : "–"}</span>
        ))}
      <span className="brow__mark">{win ? "◄" : ""}</span>
    </div>
  );
}
