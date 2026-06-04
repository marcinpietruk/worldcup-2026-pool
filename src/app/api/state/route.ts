import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { isBonusLocked, bracketWindow } from "@/lib/scoring";
import { verifyPin } from "@/lib/auth";
import { getMatchDTOs, getTeamDTOs } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const EMPTY_BRACKET = { R16: [], QF: [], SF: [], FINAL: [], CHAMPION: [] };
const EMPTY_BONUS = { championTeamId: null, runnerUpTeamId: null, goldenBoot: null };

// One-shot payload for the app: scoring config, all matches, all teams, and the
// requesting player's own picks. A player's (unlocked) picks are only returned
// when their PIN (sent via the `x-player-pin` header) verifies — knowing a
// playerId alone, which leaks via the leaderboard, must NOT expose picks.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const playerId = url.searchParams.get("playerId");
    const pin = req.headers.get("x-player-pin");
    const [settings, matches, teams] = await Promise.all([
      getSettings(),
      getMatchDTOs(),
      getTeamDTOs(),
    ]);

    let me = null;
    if (playerId) {
      // verifyPin loads the player; reuse it (one fewer round trip). Only fetch
      // picks when the passcode checks out.
      const auth = pin ? await verifyPin(playerId, pin) : null;
      if (auth?.ok) {
        const full = await prisma.player.findUnique({
          where: { id: playerId },
          include: { predictions: true, bracketPicks: true, bonusPrediction: true, jokers: true },
        });
        const predictions: Record<string, { homeScore: number; awayScore: number }> = {};
        for (const p of full!.predictions) {
          predictions[p.matchId] = { homeScore: p.homeScore, awayScore: p.awayScore };
        }
        const bracket: Record<string, string[]> = { R16: [], QF: [], SF: [], FINAL: [], CHAMPION: [] };
        for (const b of full!.bracketPicks) bracket[b.round].push(b.teamId);
        me = {
          id: full!.id,
          name: full!.name,
          authed: true,
          jokerMatchIds: full!.jokers.map((j) => j.matchId),
          predictions,
          bracket,
          bonus: full!.bonusPrediction
            ? {
                championTeamId: full!.bonusPrediction.championTeamId,
                runnerUpTeamId: full!.bonusPrediction.runnerUpTeamId,
                goldenBoot: full!.bonusPrediction.goldenBoot,
              }
            : { ...EMPTY_BONUS },
        };
      } else {
        const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true, name: true } });
        if (player) {
          // Known player, but no/invalid passcode — identity only, no picks.
          me = { id: player.id, name: player.name, authed: false, jokerMatchIds: [], predictions: {}, bracket: { ...EMPTY_BRACKET }, bonus: { ...EMPTY_BONUS } };
        }
      }
    }

    // Teams that have actually reached the Round of 32 (once the sync/admin has
    // resolved knockout participants). The bracket selector narrows to these.
    const qualifiedTeamIds = [
      ...new Set(
        matches
          .filter((m) => m.stage === "R32")
          .flatMap((m) => [m.home?.id, m.away?.id])
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    return ok({
      qualifiedTeamIds,
      settings: {
        pointsExact: settings.pointsExact,
        pointsResult: settings.pointsResult,
        bonusTournamentChampion: settings.bonusTournamentChampion,
        bonusRunnerUp: settings.bonusRunnerUp,
        bonusGoldenBoot: settings.bonusGoldenBoot,
        jokerMultiplier: settings.jokerMultiplier,
        jokerPenalty: settings.jokerPenalty,
        tournamentStart: settings.tournamentStart?.toISOString() ?? null,
        groupStageEnd: settings.groupStageEnd?.toISOString() ?? null,
        knockoutStart: settings.knockoutStart?.toISOString() ?? null,
        bonusLocked: isBonusLocked(settings),
        bracketOpen: bracketWindow(settings).open,
        bracketStatus: bracketWindow(settings).status,
      },
      matches,
      teams,
      me,
    });
  } catch (e) {
    return serverError(e);
  }
}
