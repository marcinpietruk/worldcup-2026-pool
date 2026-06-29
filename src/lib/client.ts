"use client";

// ---- Shared DTO types (mirror the API responses) -------------------------

export type TeamDTO = { id: string; name: string; flag: string | null; code: string | null; iso2: string | null; group?: string | null };

export type MatchEventDTO = { min: string; type: string; team: string | null; player: string | null };

export type MatchDTO = {
  id: string;
  number: number;
  stage: string;
  group: string | null;
  matchday: number | null;
  kickoff: string;
  status: string;
  sourceHomeNum: number | null;
  sourceAwayNum: number | null;
  home: TeamDTO | null;
  away: TeamDTO | null;
  homeLabel: string | null;
  awayLabel: string | null;
  homeScore: number | null;
  awayScore: number | null;
  statusDetail: string | null; // live clock ("27'", "HT") for in-play matches
  events: MatchEventDTO[] | null; // goal/card timeline
  venue: string | null;
  attendance: number | null;
  homeRecord: string | null; // tournament W-D-L
  awayRecord: string | null;
  locked: boolean;
};

export type SettingsDTO = {
  pointsExact: number;
  pointsResult: number;
  bonusTournamentChampion: number;
  bonusRunnerUp: number;
  bonusGoldenBoot: number;
  jokerMultiplier: number;
  jokerPenalty: number;
  tournamentStart: string | null;
  groupStageEnd: string | null;
  knockoutStart: string | null;
  bonusLocked: boolean;
  bracketOpen: boolean;
  bracketStatus: "PENDING_GROUPS" | "OPEN";
};

export type MeDTO = {
  id: string;
  name: string;
  authed: boolean; // true when the passcode verified and picks are included
  predictions: Record<string, { homeScore: number; awayScore: number }>;
  bracket: Record<string, string[]>;
  bonus: { championTeamId: string | null; runnerUpTeamId: string | null; goldenBoot: string | null };
  jokerMatchIds: string[];
};

export type StateResponse = {
  settings: SettingsDTO;
  matches: MatchDTO[];
  teams: TeamDTO[];
  qualifiedTeamIds: string[];
  me: MeDTO | null;
};

export type LeaderboardRow = {
  playerId: string;
  name: string;
  total: number;
  matchPoints: number;
  bonusPoints: number;
  exactHits: number;
  resultHits: number;
  badges: { icon: string; label: string }[];
};

export type LiveResponse = { matches: MatchDTO[]; leaderboard: LeaderboardRow[]; updatedAt: string };

// ---- Local player identity (name + PIN, no real auth) --------------------

export type StoredPlayer = { id: string; name: string; pin: string };
const KEY = "wc-player";

export function getPlayer(): StoredPlayer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredPlayer) : null;
  } catch {
    return null;
  }
}

export function setPlayer(p: StoredPlayer) {
  window.localStorage.setItem(KEY, JSON.stringify(p));
}

export function clearPlayer() {
  window.localStorage.removeItem(KEY);
}

// ---- Fetch helpers -------------------------------------------------------

// Fetch /api/state, sending the player's PIN as a header so the server returns
// that player's own picks (without a valid PIN, picks are withheld).
export async function fetchState(player: StoredPlayer | null): Promise<StateResponse> {
  const res = await fetch(player ? `/api/state?playerId=${player.id}` : "/api/state", {
    cache: "no-store",
    headers: player ? { "x-player-pin": player.pin } : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json() as Promise<StateResponse>;
}

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function postJSON<T>(
  url: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
  return { ok: true, data: data as T };
}
