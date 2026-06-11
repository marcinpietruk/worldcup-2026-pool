-- Recent-form ("last 5") was confusing next to the tournament record, so drop it.
ALTER TABLE "Match" DROP COLUMN "homeForm";
ALTER TABLE "Match" DROP COLUMN "awayForm";
