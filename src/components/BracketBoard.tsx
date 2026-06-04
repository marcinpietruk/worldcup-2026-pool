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
import { Trophy } from "lucide-react";
import { Flag } from "./Flag";
import { Button } from "./ui";

const STAGE_TITLE: Record<KoStage, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  FINAL: "Final",
};

type Line = { left: number; top: number; width: number; height: number };

export function BracketBoard({
  matches,
  saved,
  editable,
  onSave,
}: {
  matches: MatchDTO[];
  saved: Record<string, string[]>;
  editable: boolean;
  onSave: (picks: Record<string, string[]>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const rounds = useMemo(() => bracketRounds(matches), [matches]);
  const teamById = useMemo(() => {
    const map = new Map<string, TeamDTO>();
    for (const m of matches) {
      if (m.home) map.set(m.home.id, m.home);
      if (m.away) map.set(m.away.id, m.away);
    }
    return map;
  }, [matches]);

  const [winners, setWinners] = useState<Record<number, string>>(() => reconstructWinners(saved, rounds));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const bracketRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);

  // Draw orthogonal connectors feeder → target after layout.
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
    if (!editable || !teamId) return;
    setWinners((prev) => normalizeWinners({ ...prev, [matchNumber]: teamId }, rounds));
    setMsg(null);
  }

  async function save() {
    setBusy(true);
    const res = await onSave(deriveRoundPicks(winners, rounds));
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
                return (
                  <div key={m.id} className="mb" data-mb={m.number}>
                    <Seat teamId={hId} placeholder={m.home?.name ?? m.homeLabel} team={hId ? teamById.get(hId) : undefined} picked={!!hId && winners[m.number] === hId} editable={editable} onClick={() => pick(m.number, hId)} />
                    <Seat teamId={aId} placeholder={m.away?.name ?? m.awayLabel} team={aId ? teamById.get(aId) : undefined} picked={!!aId && winners[m.number] === aId} editable={editable} onClick={() => pick(m.number, aId)} />
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

function Seat({ teamId, team, placeholder, picked, editable, onClick }: {
  teamId: string | null;
  team: TeamDTO | undefined;
  placeholder: string | null | undefined;
  picked: boolean;
  editable: boolean;
  onClick: () => void;
}) {
  const clickable = editable && !!teamId;
  return (
    <button type="button" onClick={onClick} disabled={!clickable} className={`bseat${picked ? " pick" : ""}${!team ? " dim" : ""}${clickable ? " clickable" : ""}`}>
      {team ? <Flag iso2={team.iso2} name={team.name} size="sm" /> : <span className="flag flag--sm flag--tbd" />}
      <span className="bn">{team?.name ?? placeholder ?? "TBD"}</span>
    </button>
  );
}
