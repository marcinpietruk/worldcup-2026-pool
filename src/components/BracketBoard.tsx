"use client";

import { useMemo, useState } from "react";
import type { MatchDTO, TeamDTO } from "@/lib/client";
import {
  bracketRounds,
  candidates,
  deriveRoundPicks,
  normalizeWinners,
  reconstructWinners,
  type KoStage,
} from "@/lib/bracket";
import { Button } from "./ui";

const STAGE_TITLE: Record<KoStage, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  FINAL: "Final",
};

// A graphical knockout bracket. Click a team to advance it; the pick flows into
// the next round. Produces our round-set bracket picks on save.
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

  const [winners, setWinners] = useState<Record<number, string>>(() =>
    reconstructWinners(saved, rounds),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  const championId = winners[rounds.find((r) => r.stage === "FINAL")?.matches[0]?.number ?? -1];
  const champion = championId ? teamById.get(championId) : null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {rounds.map((round) => (
            <div key={round.stage} className="flex w-44 flex-col">
              <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-slate-400">
                {STAGE_TITLE[round.stage]}
              </div>
              <div className="flex flex-1 flex-col justify-around gap-2">
                {round.matches.map((m) => {
                  const [hId, aId] = candidates(m, winners);
                  return (
                    <div key={m.id} className="rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
                      <Slot
                        teamId={hId}
                        placeholder={m.home?.name ?? m.homeLabel}
                        team={hId ? teamById.get(hId) : undefined}
                        picked={winners[m.number] === hId && !!hId}
                        editable={editable}
                        onClick={() => pick(m.number, hId)}
                      />
                      <div className="border-t border-slate-100" />
                      <Slot
                        teamId={aId}
                        placeholder={m.away?.name ?? m.awayLabel}
                        team={aId ? teamById.get(aId) : undefined}
                        picked={winners[m.number] === aId && !!aId}
                        editable={editable}
                        onClick={() => pick(m.number, aId)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Champion column */}
          <div className="flex w-32 flex-col">
            <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-slate-400">Champion</div>
            <div className="flex flex-1 items-center justify-center">
              <div className={`rounded-xl border-2 px-3 py-4 text-center ${champion ? "border-amber-400 bg-amber-50" : "border-dashed border-slate-200"}`}>
                <div className="text-3xl">{champion ? champion.flag : "🏆"}</div>
                <div className="mt-1 text-sm font-bold text-slate-700">{champion ? champion.name : "—"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {editable && (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save bracket"}</Button>
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}

function Slot({
  teamId,
  team,
  placeholder,
  picked,
  editable,
  onClick,
}: {
  teamId: string | null;
  team: TeamDTO | undefined;
  placeholder: string | null | undefined;
  picked: boolean;
  editable: boolean;
  onClick: () => void;
}) {
  const clickable = editable && !!teamId;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition ${
        picked ? "bg-emerald-50 font-bold text-emerald-800" : "text-slate-600"
      } ${clickable ? "hover:bg-slate-50" : "cursor-default"}`}
    >
      <span className="text-base">{team?.flag ?? (teamId ? "" : "")}</span>
      <span className={`truncate ${!team ? "text-xs italic text-slate-400" : ""}`}>
        {team?.name ?? placeholder ?? "—"}
      </span>
    </button>
  );
}
