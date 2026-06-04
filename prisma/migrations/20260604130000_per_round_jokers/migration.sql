-- Per-round jokers: new Joker table, drop the single Player.jokerMatchId.
CREATE TABLE "Joker" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    CONSTRAINT "Joker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Joker_playerId_round_key" ON "Joker"("playerId", "round");

ALTER TABLE "Joker" ADD CONSTRAINT "Joker_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Joker" ADD CONSTRAINT "Joker_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Player" DROP COLUMN "jokerMatchId";
