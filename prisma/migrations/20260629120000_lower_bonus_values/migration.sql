-- Lower the tournament bonus point values: Champion 25->15, Runner-up 15->10,
-- Golden Boot 10->5. One-time data update of the single Settings row (id = 1);
-- the admin panel can still change these afterwards.
UPDATE "Settings"
SET "bonusTournamentChampion" = 15,
    "bonusRunnerUp" = 10,
    "bonusGoldenBoot" = 5
WHERE "id" = 1;
