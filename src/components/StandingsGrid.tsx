import { Card } from "./ui";
import { Flag } from "./Flag";
import type { computeStandings } from "@/lib/standings";

// Grid of the 12 group tables (top 2 highlighted as qualifying). Pure
// presentation — pass it the output of computeStandings(). Used by the Groups
// page; rows fill in automatically as results come in.
export function StandingsGrid({ groups }: { groups: ReturnType<typeof computeStandings> }) {
  return (
    <div className="stand-grid">
      {groups.map((g) => (
        <Card key={g.group} className="stand overflow-hidden">
          <div className="card__head">
            Group {g.group}
            <span className="qpill">top 2 advance</span>
          </div>
          <table>
            <thead>
              <tr>
                <th className="l">Team</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GD</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={r.teamId} className={i < 2 ? "qual" : ""}>
                  <td className="l"><Flag iso2={r.iso2} name={r.name} size="sm" /> {r.name}</td>
                  <td>{r.p}</td>
                  <td>{r.w}</td>
                  <td>{r.d}</td>
                  <td>{r.l}</td>
                  <td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                  <td><span className="pts num">{r.pts}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
