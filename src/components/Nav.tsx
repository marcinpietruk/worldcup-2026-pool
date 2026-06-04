"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getPlayer } from "@/lib/client";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/predict", label: "Predict" },
  { href: "/matches", label: "Matches" },
  { href: "/leaderboard", label: "Table" },
  { href: "/h2h", label: "H2H" },
  { href: "/rules", label: "Rules" },
];

export function Nav() {
  const pathname = usePathname();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    setName(getPlayer()?.name ?? null);
    // Refresh on focus so sign-in/out elsewhere reflects here.
    const onFocus = () => setName(getPlayer()?.name ?? null);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [pathname]);

  return (
    <header className="brand-gradient text-white shadow-md">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between py-3">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="text-2xl">🏆</span>
            <span className="leading-tight">
              World Cup 2026 <span className="hidden sm:inline opacity-80">· Office Pool</span>
            </span>
          </Link>
          <div className="text-sm">
            {name ? (
              <span className="rounded-full bg-white/15 px-3 py-1 font-medium">👤 {name}</span>
            ) : (
              <Link href="/" className="rounded-full bg-white/15 px-3 py-1 font-medium hover:bg-white/25">
                Join
              </Link>
            )}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto pb-2 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition ${
                  active ? "bg-white text-emerald-800" : "text-white/90 hover:bg-white/15"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
