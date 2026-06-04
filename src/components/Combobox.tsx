"use client";

import { useEffect, useRef, useState } from "react";
import { Flag } from "./Flag";

export type ComboOption = { value: string; label: string; iso2?: string | null; sub?: string };

// A searchable dropdown. With flags (teams) or a sub-label (player + team).
// `allowCustom` lets the typed text itself become the value (Golden Boot names).
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  allowCustom,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  placeholder?: string;
  allowCustom?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const display = selected ? selected.label : value;
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 40);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(o: ComboOption) {
    onChange(o.value);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <input
        className="input"
        disabled={disabled}
        value={open ? q : display}
        placeholder={placeholder}
        onFocus={() => { if (!disabled) { setOpen(true); setQ(""); } }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          if (allowCustom) onChange(e.target.value);
        }}
        autoComplete="off"
      />
      {value && !open && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onChange(""); }}
          aria-label="Clear"
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--ink-faint)", fontWeight: 800 }}
        >
          ×
        </button>
      )}
      {open && filtered.length > 0 && (
        <div className="card" style={{ position: "absolute", zIndex: 30, top: "calc(100% + 4px)", left: 0, right: 0, maxHeight: 260, overflowY: "auto" }}>
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: o.value === value ? "var(--surface-2)" : "transparent", border: "none", textAlign: "left", fontWeight: 600, fontSize: 14, color: "var(--ink)", borderBottom: "var(--bd-thin)" }}
            >
              {o.iso2 !== undefined && <Flag iso2={o.iso2} name={o.label} size="sm" />}
              <span style={{ flex: 1 }}>{o.label}</span>
              {o.sub && <span className="muted" style={{ fontSize: 12 }}>{o.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
