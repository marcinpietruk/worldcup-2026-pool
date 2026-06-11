-- Extra match context from the live provider (ESPN): goal/card timeline, venue,
-- attendance, recent form and tournament record per side. All nullable adds —
-- instant, no backfill.
ALTER TABLE "Match" ADD COLUMN "events" JSONB;
ALTER TABLE "Match" ADD COLUMN "venue" TEXT;
ALTER TABLE "Match" ADD COLUMN "attendance" INTEGER;
ALTER TABLE "Match" ADD COLUMN "homeForm" TEXT;
ALTER TABLE "Match" ADD COLUMN "awayForm" TEXT;
ALTER TABLE "Match" ADD COLUMN "homeRecord" TEXT;
ALTER TABLE "Match" ADD COLUMN "awayRecord" TEXT;
