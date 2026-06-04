"use client";

import { useEffect, useState } from "react";
import { getJSON, type LiveResponse } from "./client";

const SOON_MS = 15 * 60_000;
const RECENT_MS = 3 * 3600_000;

// Poll /api/live with an adaptive cadence: fast (~20s) when a match is live or
// imminent, relaxed (~60s) otherwise. The server still throttles the actual
// upstream API calls, so faster client polling just means fresher reads.
export function useLive(): { live: LiveResponse | null; error: string | null } {
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const nextDelay = (d: LiveResponse | null): number => {
      if (!d) return 30_000;
      const now = Date.now();
      const hot = d.matches.some((m) => {
        if (m.status === "LIVE") return true;
        if (m.status === "FINISHED") return false;
        const dt = new Date(m.kickoff).getTime() - now;
        return dt <= SOON_MS && dt > -RECENT_MS; // about to start or recently kicked off
      });
      return hot ? 20_000 : 60_000;
    };

    async function tick() {
      let d: LiveResponse | null = null;
      try {
        d = await getJSON<LiveResponse>("/api/live");
        if (!cancelled) {
          setLive(d);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
      if (!cancelled) timer = setTimeout(tick, nextDelay(d));
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { live, error };
}
