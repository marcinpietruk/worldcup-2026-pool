"use client";

import type { ReactNode } from "react";
import { Ball } from "./icons";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Button({
  children,
  onClick,
  disabled,
  type = "button",
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: "primary" | "ghost" | "danger" | "grass";
  className?: string;
}) {
  const v =
    variant === "ghost"
      ? "btn--ghost"
      : variant === "grass"
        ? "btn--grass"
        : "btn--primary"; // primary + danger → tomato
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`btn ${v} ${className}`}>
      {children}
    </button>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="spinner">
      <Ball className="ic-svg spin" />
      {label}
    </div>
  );
}

export function Message({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  return <div className={`msg msg--${kind}`}>{children}</div>;
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb">
      <h2 className="disp" style={{ fontSize: 20 }}>{children}</h2>
      {sub && <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>{sub}</p>}
    </div>
  );
}
