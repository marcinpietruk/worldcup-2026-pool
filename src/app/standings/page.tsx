"use client";

import { useMemo } from "react";
import { useLive } from "@/lib/useLive";
import { Spinner, Message } from "@/components/ui";
import { StandingsGrid } from "@/components/StandingsGrid";
import { computeStandings } from "@/lib/standings";

export default function StandingsPage() {
  const { live } = useLive();
  const standings = useMemo(() => computeStandings(live?.matches ?? []), [live]);
  const played = standings.some((g) => g.rows.some((r) => r.p > 0));

  if (!live) return <Spinner label="Loading groups…" />;

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>Groups</h1>
          <div className="sub">{standings.length} groups · top 2 advance</div>
        </div>
      </div>

      {standings.length === 0 ? (
        <Message kind="info">Groups will show up here once the draw is loaded.</Message>
      ) : (
        <>
          {!played && (
            <Message kind="info">
              The group stage hasn’t kicked off yet — these tables fill in automatically as results come in.
            </Message>
          )}
          <StandingsGrid groups={standings} />
        </>
      )}
    </div>
  );
}
