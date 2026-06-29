"use client";

import { useEffect, useState } from "react";
import { Target, Star, Goal, Sparkles, Lock, Crown, KeyRound } from "lucide-react";
import { getJSON, type StateResponse, type SettingsDTO } from "@/lib/client";
import { Card, Spinner } from "@/components/ui";

export default function RulesPage() {
  const [s, setS] = useState<SettingsDTO | null>(null);
  useEffect(() => {
    getJSON<StateResponse>("/api/state").then((r) => setS(r.settings)).catch(() => {});
  }, []);
  if (!s) return <Spinner />;

  return (
    <div className="stack">
      <div className="pagehead"><h1>How it works</h1></div>
      <Card>
        <div className="card__body">
          <Rule Icon={Target} title="Predict the group stage">
            Enter an exact scoreline for every group game. <b>{s.pointsExact} points</b> for the exact score,{" "}
            <b>{s.pointsResult} point</b> for the right result, 0 otherwise. The knockout phase is predicted in the bracket.
          </Rule>
          <Rule Icon={Star} title="Jokers (double-down)">
            <b>One joker per round</b> — each group matchday (3) and each knockout round up to the semis (R32→SF).
            Star a match in that round to <b>multiply its points ×{s.jokerMultiplier}</b>; a flop costs you{" "}
            <b>{s.jokerPenalty} points</b>. Movable until that match kicks off.
          </Rule>
          <Rule Icon={Goal} title="Knockout bracket">
            Advance teams through the bracket so each tie has a matchup, then predict its exact score. Ties score
            exactly like the group stage — <b>{s.pointsExact} pts</b> exact, <b>{s.pointsResult} pt</b> result.
            There&apos;s <b>no separate bonus</b> for picking who advances; your joker still doubles a tie.
          </Rule>
          <Rule Icon={Sparkles} title="Tournament bonuses">
            Locked in before any game starts: Champion <b>+{s.bonusTournamentChampion}</b>, Runner-up{" "}
            <b>+{s.bonusRunnerUp}</b>, Golden Boot <b>+{s.bonusGoldenBoot}</b>.
          </Rule>
          <Rule Icon={Lock} title="Locking">
            Match picks lock at kickoff. The bracket opens once the group stage is over
            { s.groupStageEnd ? ` (around ${new Date(s.groupStageEnd).toLocaleDateString()})` : "" }; from then each tie
            locks at its own kickoff, just like the group stage. Bonuses lock at the first kickoff. All enforced on the server.
          </Rule>
          <Rule Icon={Crown} title="Winning">
            Most points wins. Ties broken by most exact scores, then most correct results.
          </Rule>
          <Rule Icon={KeyRound} title="Your name & passcode">
            No accounts — join with a name and a passcode (4–20 characters). It stops others editing your picks, but
            it&apos;s light protection, not real security.
          </Rule>
        </div>
      </Card>
    </div>
  );
}

function Rule({ Icon, title, children }: { Icon: typeof Target; title: string; children: React.ReactNode }) {
  return (
    <div className="rule">
      <div className="ric"><Icon className="ic-svg" /></div>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}
