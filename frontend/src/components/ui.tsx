// components/ui.tsx — shared micro-components
import React from "react";
import clsx from "clsx";

// ── Direction Badge ───────────────────────────────────────────────────────────
export function DirectionBadge({ dir }: { dir: "LONG" | "SHORT" | "FLAT" }) {
  return (
    <span className={clsx("badge", {
      "badge-long":  dir === "LONG",
      "badge-short": dir === "SHORT",
      "badge-flat":  dir === "FLAT",
    })}>
      {dir === "LONG" ? "▲ LONG" : dir === "SHORT" ? "▼ SHORT" : "— FLAT"}
    </span>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label:      string;
  value:      string | number;
  sub?:       string;
  color?:     "cyan" | "green" | "red" | "amber" | "default";
  className?: string;
}

export function StatCard({ label, value, sub, color = "default", className }: StatCardProps) {
  const colorMap = {
    cyan:    "text-accent-cyan",
    green:   "text-accent-green",
    red:     "text-accent-red",
    amber:   "text-accent-amber",
    default: "text-text-primary",
  };
  return (
    <div className={clsx("card p-4 flex flex-col gap-1", className)}>
      <span className="text-xs text-text-muted uppercase tracking-widest font-mono">{label}</span>
      <span className={clsx("metric-num", colorMap[color])}>{value}</span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

// ── ROI Cell ──────────────────────────────────────────────────────────────────
export function RoiCell({ value }: { value: number }) {
  const pos = value >= 0;
  return (
    <span className={clsx("font-mono font-semibold text-sm", pos ? "text-accent-green" : "text-accent-red")}>
      {pos ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

// ── Risk Bar ──────────────────────────────────────────────────────────────────
export function RiskBar({ value }: { value: number }) {
  const pct = Math.min(Math.max(value * 100, 0), 100);
  const color = pct > 70 ? "#ff1744" : pct > 40 ? "#ffc400" : "#00e676";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono text-text-muted">{pct.toFixed(0)}%</span>
    </div>
  );
}

// ── Pill ──────────────────────────────────────────────────────────────────────
export function Pill({ children, color = "default" }: { children: React.ReactNode; color?: string }) {
  const map: Record<string, string> = {
    cyan:    "bg-cyan-900/30 text-cyan-300 border-cyan-800/40",
    green:   "bg-green-900/30 text-green-300 border-green-800/40",
    red:     "bg-red-900/30 text-red-300 border-red-800/40",
    default: "bg-slate-800/50 text-slate-400 border-slate-700/40",
  };
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-xs border font-mono", map[color] ?? map.default)}>
      {children}
    </span>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx("animate-pulse bg-bg-border rounded", className)} />
  );
}

// ── Connection Dot ────────────────────────────────────────────────────────────
export function ConnectionDot({ state }: { state: "connecting" | "open" | "closed" | "error" }) {
  const map = {
    open:       "bg-accent-green shadow-[0_0_8px_#00e676]",
    connecting: "bg-accent-amber animate-pulse",
    closed:     "bg-text-muted",
    error:      "bg-accent-red",
  };
  return <span className={clsx("inline-block w-2 h-2 rounded-full", map[state])} />;
}

// ── Score Bar ─────────────────────────────────────────────────────────────────
export function ScoreBar({ value }: { value: number }) {
  // score is roughly -0.1 to 0.5
  const normalised = Math.min(Math.max((value + 0.1) / 0.6, 0), 1);
  const pct = normalised * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, #00e5ff, #7c3aed)`,
          }}
        />
      </div>
      <span className="text-xs font-mono text-text-muted">{value.toFixed(3)}</span>
    </div>
  );
}
