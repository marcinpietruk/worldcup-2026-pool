# Office World Cup 2026 Pool ⚽🏆

A prediction game for the 2026 FIFA World Cup (48 teams, 104 matches, 11 Jun – 19 Jul 2026).
Everyone joins with a name + 4-digit PIN, predicts scorelines, calls the knockout bracket and
tournament bonuses, and climbs a live office leaderboard.

- **Match scoring (Classic):** 3 pts exact score, 1 pt correct result, 0 otherwise.
- **Bracket bonus:** points for each team you correctly tip to reach R16 / QF / SF / Final / Champion.
- **Tournament bonuses:** Champion, Runner-up, Golden Boot.
- **Locking:** match picks lock at kickoff; bracket/bonus lock at the first kickoff. Enforced server-side.
- **Live updates:** scores/results pull automatically from a football API; the leaderboard recomputes.

Built with Next.js (App Router) + Prisma + Postgres + Tailwind.

## Run it locally

Requires Node 20+, Docker (for a local Postgres), and `npm install`.

```bash
# 1. Start a local Postgres (port 5433)
docker run -d --name wc-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=worldcup \
  -p 5433:5432 postgres:16

# 2. Apply the schema and seed the tournament (teams, groups, all 104 fixtures)
npx prisma migrate dev
npm run db:seed

# 3. Start the app
npm run dev          # http://localhost:3000
```

Environment is read from `.env` (see `.env.example`). The defaults work out of the box for local
dev; the secret worth setting is `ADMIN_PASSWORD` (defaults to `changeme-admin`).

### Try it
- Open http://localhost:3000, join with a name + PIN, and make some predictions.
- Go to **/admin** (password = `ADMIN_PASSWORD`) to enter results manually and watch the leaderboard
  recompute. This is also how you test scoring without a live API key.

### Handy scripts
| Command | What it does |
| --- | --- |
| `npm run db:seed` | Seed/refresh teams + fixtures from the bundled dataset (`data/worldcup2026.json`). |
| `npm run dev:results` | **Dev only:** finish all group matches with sample scores. |
| `npm run dev:results all` | **Dev only:** play out a full bracket (tests bracket/bonus scoring). |
| `npm run db:reset` | **Dev only:** clear all results back to scheduled. |
| `npm run db:sync` | Pull live results from the football API (needs `FOOTBALL_API_KEY`). |
| `npm test` | Unit tests for parsing, team-name matching, and scoring. |

## How live updates work

- The canonical fixture list is a bundled snapshot (no API key needed) — `npm run db:seed`.
- Live scores/results come from **football-data.org** (free tier covers WC 2026) when
  `FOOTBALL_DATA_TOKEN` is set. One request returns all fixtures; the sync maps them onto the seeded
  matches (orientation-safe, penalty/winner-aware) and recomputes points. API-Football is a paid-tier
  fallback, off unless `USE_API_FOOTBALL=1` (its free tier can't serve 2026).
- `GET /api/live` (polled by the Matches/Leaderboard pages) triggers an **adaptive, throttled** sync:
  ~every 25s while a match is live/imminent, 10 min within 6h of a game, 6h when idle — app-wide, so
  many viewers share one upstream call and stay inside the rate limit.
- `GET/POST /api/refresh?secret=REFRESH_SECRET` forces a sync; point a free scheduler at it (GitHub
  Actions / cron-job.org) for updates while nobody has the page open.
- Without a token, results are entered via **/admin** (manual override).

## Notable features

- Predict all 104 scorelines; **knockout bracket** (opens after the group stage, narrowed to the 32
  qualified teams) and **tournament bonuses** (champion / runner-up / golden boot).
- **Live leaderboard** with rank-movement arrows; tie-break by exact scores then correct results.
- **Group standings** computed live on the Matches page.
- **Per-match detail pages** that reveal everyone's picks (and points) once a match kicks off.
- Server-enforced locking; PIN-gated picks (private until lock) with brute-force rate limiting.

> **Identity:** there are no real accounts. Name + PIN is light tamper-protection only — fine for an
> office, not real security.

## Deploying (later)

Runs anywhere with Node + a Postgres connection string. Intended target: Vercel (free tier) + hosted
Postgres (Neon / Supabase / Vercel Postgres). Set `DATABASE_URL`, `ADMIN_PASSWORD`, `FOOTBALL_DATA_TOKEN`,
`REFRESH_SECRET` as env vars and deploy — `npm run build` runs `prisma migrate deploy` automatically.
Seed production once via **/admin → Tools → Re-seed fixtures** (or `POST /api/admin/seed`).

### Live-score scheduler (so scores update when nobody has the page open)

A GitHub Actions workflow (`.github/workflows/refresh.yml`) pings `/api/refresh` every 5 minutes. The
endpoint is **smart** — it only calls the football API when a match is live or kicking off within
15 min, so it's near-real-time during games and a free no-op otherwise (`?force=1` syncs regardless).
To activate after deploying, add two **repository secrets** (Settings → Secrets and variables → Actions):

- `APP_URL` — your deployed base URL (e.g. `https://your-app.vercel.app`)
- `REFRESH_SECRET` — must match the deployed env var

(Alternatively, point a free [cron-job.org](https://cron-job.org) job at `APP_URL/api/refresh?secret=…`.)
When someone has the Matches/Leaderboard page open, the client also polls every ~20–60s, so the cron is
just the safety net for when nobody's watching.
