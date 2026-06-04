"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getPlayer } from "@/lib/client";
import { Ball } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

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
    const refresh = () => setName(getPlayer()?.name ?? null);
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [pathname]);

  return (
    <header className="topbar">
      <div className="topbar__in">
        <div className="topbar__row">
          <Link href="/" className="brandmark">
            <span className="ball">
              <Ball className="ic-svg" />
            </span>
            <span className="bt">
              World Cup 2026<small>Office Pool</small>
            </span>
          </Link>
          <div className="topbar__right">
            {name ? (
              <span className="userchip">
                <span className="av">{name.charAt(0).toUpperCase()}</span>
                {name}
              </span>
            ) : (
              <Link href="/" className="userchip">
                <span className="av">+</span> Join
              </Link>
            )}
            <ThemeToggle />
          </div>
        </div>
        <nav className="nav">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={active ? "active" : ""}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
