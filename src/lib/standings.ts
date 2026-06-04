import type { MatchDTO } from "./client";

export type StandingRow = {
  teamId: string;
  name: string;
  iso2: string | null;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

// Compute live group standings from finished group-stage matches. Ranking uses
// points → goal difference → goals for → name (a simplified, display-friendly
// version of FIFA's full tiebreakers).
export function computeStandings(matches: MatchDTO[]): { group: string; rows: StandingRow[] }[] {
  const groups = new Map<string, Map<string, StandingRow>>();

  const row = (g: string, t: { id: string; name: string; iso2: string | null }) => {
    if (!groups.has(g)) groups.set(g, new Map());
    const table = groups.get(g)!;
    if (!table.has(t.id)) {
      table.set(t.id, { teamId: t.id, name: t.name, iso2: t.iso2, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
    }
    return table.get(t.id)!;
  };

  for (const m of matches) {
    if (m.stage !== "GROUP" || !m.group || !m.home || !m.away) continue;
    // Register both teams (so the full group table shows even before kickoff)…
    const h = row(m.group, m.home);
    const a = row(m.group, m.away);
    // …then accumulate only from finished games.
    if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) continue;
    h.p++; a.p++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    if (m.homeScore > m.awayScore) { h.w++; h.pts += 3; a.l++; }
    else if (m.homeScore < m.awayScore) { a.w++; a.pts += 3; h.l++; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, table]) => {
      const rows = [...table.values()].map((r) => ({ ...r, gd: r.gf - r.ga }));
      rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name));
      return { group, rows };
    });
}
