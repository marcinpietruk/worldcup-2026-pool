"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("wc-theme", next);
    } catch {}
    setTheme(next);
  }

  return (
    <button className="tgl" onClick={toggle} aria-label="Toggle light/dark theme">
      {theme === "dark" ? <Sun className="ic-svg" /> : <Moon className="ic-svg" />}
    </button>
  );
}
