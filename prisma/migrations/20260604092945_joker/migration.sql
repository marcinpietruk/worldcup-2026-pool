-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "jokerMatchId" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "jokerMultiplier" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "jokerPenalty" INTEGER NOT NULL DEFAULT 3;
