-- Knockout advancement bonuses removed. Knockout ties now score exactly like
-- the group stage (scoreline only: pointsExact / pointsResult, jokers still
-- apply). The tournament-long bonuses (champion / runner-up / golden boot) are
-- bumped to 25 / 15 / 10 and remain locked at the first kickoff.

-- New defaults (for any fresh install / settings row recreation).
ALTER TABLE "Settings" ALTER COLUMN "bonusR16" SET DEFAULT 0;
ALTER TABLE "Settings" ALTER COLUMN "bonusQF" SET DEFAULT 0;
ALTER TABLE "Settings" ALTER COLUMN "bonusSF" SET DEFAULT 0;
ALTER TABLE "Settings" ALTER COLUMN "bonusFinal" SET DEFAULT 0;
ALTER TABLE "Settings" ALTER COLUMN "bonusChampion" SET DEFAULT 0;
ALTER TABLE "Settings" ALTER COLUMN "bonusTournamentChampion" SET DEFAULT 25;
ALTER TABLE "Settings" ALTER COLUMN "bonusRunnerUp" SET DEFAULT 15;
ALTER TABLE "Settings" ALTER COLUMN "bonusGoldenBoot" SET DEFAULT 10;

-- Apply to the live settings row.
UPDATE "Settings" SET
  "bonusR16" = 0,
  "bonusQF" = 0,
  "bonusSF" = 0,
  "bonusFinal" = 0,
  "bonusChampion" = 0,
  "bonusTournamentChampion" = 25,
  "bonusRunnerUp" = 15,
  "bonusGoldenBoot" = 10;

-- Zero out any advancement points already computed (none expected before the
-- knockouts, but keep it idempotent).
UPDATE "BracketPrediction" SET "points" = 0 WHERE "points" <> 0;
