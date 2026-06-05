-- Stores the leaderboard standings captured at the last Slack digest post, so the
-- next digest can show day-over-day movement (▲/▼). JSON shape:
--   { "takenAt": "<ISO>", "ranks": { "<playerId>": { "rank": 0, "total": 0 } } }
ALTER TABLE "Settings" ADD COLUMN "digestSnapshot" JSONB;
