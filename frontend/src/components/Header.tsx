// components/Header.tsx
import React from "react";
import { ConnectionDot } from "./ui";
import { HealthStatus } from "@/lib/api";

interface Props {
  health:    HealthStatus | null;
  connState: "connecting" | "open" | "closed" | "error";
  lastUpdated: Date | null;
}

export default function Header({ health, connState, lastUpdated }: Props) {
  return (
    <header className="sticky top-0 z-50 border-b border-bg-border bg-bg-panel/80 backdrop-blur-md">
      <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-cyan-400 to-violet-600 flex items-center justify-center text-xs font-bold text-white">
            AI
          </div>
          <span className="font-display font-semibold text-sm text-text-primary tracking-wide">
            Futures<span className="text-accent-cyan">AI</span> Trend Bot
          </span>
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-4 text-xs font-mono text-text-muted">

          {/* WS connection */}
          <span className="flex items-center gap-1.5">
            <ConnectionDot state={connState} />
            {connState === "open" ? "LIVE" : connState.toUpperCase()}
          </span>

          {/* Last update */}
          {lastUpdated && (
            <span className="hidden sm:block">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}

          {/* Health */}
          {health && (
            <>
              <span className="hidden md:block">
                <span className="text-text-dim">Scan #</span>{health.scan_count}
              </span>
              <span className="hidden md:block">
                <span className="text-text-dim">Tracked </span>
                <span className="text-accent-cyan">{health.symbols_tracked}</span>
              </span>
              <span className="hidden lg:block">
                <span className="text-text-dim">Up </span>
                {Math.floor(health.uptime_s / 60)}m
              </span>
            </>
          )}

          {/* Status pill */}
          {health && (
            <span className={`px-2 py-0.5 rounded text-xs border font-mono ${
              health.status === "ok"
                ? "bg-green-900/20 text-green-400 border-green-800/40"
                : "bg-amber-900/20 text-amber-400 border-amber-800/40"
            }`}>
              {health.status === "ok" ? "● RUNNING" : "◌ WARMING"}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
