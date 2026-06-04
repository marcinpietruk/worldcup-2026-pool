"use client";

import { useEffect, useState } from "react";

// Ticking days/hrs/min countdown to an ISO target. Renders nothing on the server
// (avoids hydration mismatch), fills in after mount.
export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;

  const diff = Math.max(0, new Date(to).getTime() - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor(diff / 3_600_000) % 24;
  const m = Math.floor(diff / 60_000) % 60;
  const cell = (n: number, u: string) => (
    <div className="cd-cell">
      <div className="n num">{n}</div>
      <div className="u">{u}</div>
    </div>
  );
  return (
    <div className="countdown">
      {cell(d, "days")}
      {cell(h, "hrs")}
      {cell(m, "min")}
    </div>
  );
}
