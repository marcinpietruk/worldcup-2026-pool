"use client";

import { useEffect, useState } from "react";
import { getJSON, type StateResponse, type SettingsDTO } from "@/lib/client";
import { Card, Spinner } from "@/components/ui";

export default function RulesPage() {
  const [s, setS] = useState<SettingsDTO | null>(null);
  useEffect(() => {
    getJSON<StateResponse>("/api/state").then((r) => setS(r.settings)).catch(() => {});
  }, []);
  if (!s) return <Spinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">How it works</h1>

      <Card className="space-y-3 p-5 text-sm leading-relaxed text-slate-600">
        <Rule title="🎯 Predict every match">
          Enter an exact scoreline for all 104 games. <b>{s.pointsExact} points</b> for the exact score,{" "}
          <b>{s.pointsResult} point</b> for the correct result (win/draw/loss) with the wrong score, 0 otherwise.
        </Rule>
        <Rule title="⭐ Joker (double-down)">
          Star one match to <b>multiply its points ×{s.jokerMultiplier}</b>. But it cuts both ways — if your
          jokered match scores nothing, you <b>lose {s.jokerPenalty} points</b>. Move your joker freely until
          that match kicks off, then it&apos;s locked in.
        </Rule>
        <Rule title="🏟️ Knockout bracket">
          Pick which teams reach each round. Bonus points per correct team: Round of 16 <b>+{s.bonusR16}</b>,
          Quarter-finals <b>+{s.bonusQF}</b>, Semi-finals <b>+{s.bonusSF}</b>, Final <b>+{s.bonusFinal}</b>,
          Champion <b>+{s.bonusChampion}</b>.
        </Rule>
        <Rule title="⭐ Tournament bonuses">
          Call it before kickoff: Champion <b>+{s.bonusTournamentChampion}</b>, Runner-up <b>+{s.bonusRunnerUp}</b>,
          Golden Boot <b>+{s.bonusGoldenBoot}</b>.
        </Rule>
        <Rule title="🔒 Locking">
          Each match prediction locks at that match&apos;s kickoff. The <b>knockout bracket</b> opens once
          the group stage is over{ s.groupStageEnd ? ` (around ${new Date(s.groupStageEnd).toLocaleDateString()})` : "" } —
          you pick who advances knowing who qualified — and locks when the first knockout match kicks off.
          The <b>tournament bonuses</b> lock at the first kickoff{ s.tournamentStart ? ` (${new Date(s.tournamentStart).toLocaleString()})` : "" }.
          All locking is enforced on the server.
        </Rule>
        <Rule title="🏆 Winning">
          Most points wins. Ties are broken by most exact scores, then most correct results.
        </Rule>
        <Rule title="🔑 Your name & PIN">
          There are no accounts — you join with a name and a 4-digit PIN. The PIN stops others editing your
          picks, but it is light protection, not real security. Don&apos;t reuse a sensitive PIN.
        </Rule>
      </Card>
    </div>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-bold text-slate-800">{title}</h2>
      <p>{children}</p>
    </div>
  );
}
