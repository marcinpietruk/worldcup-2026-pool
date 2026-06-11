-- Live clock for in-play matches ("27'", "HT") from the live provider (ESPN).
-- Null when the match isn't LIVE. Nullable add — instant, no backfill.
ALTER TABLE "Match" ADD COLUMN "statusDetail" TEXT;
