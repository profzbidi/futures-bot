// pages/index.tsx — Main dashboard
"use client";
import React, { useEffect, useState } from "react";
import Head from "next/head";
import useSWR from "swr";
import { useRankingWS } from "@/hooks/useRankingWS";
import { fetchHealth, fetchRanking, HealthStatus, RankingItem } from "@/lib/api";
import Header from "@/components/Header";
import RankingTable from "@/components/RankingTable";
import SymbolPanel from "@/components/SymbolPanel";
import { StatCard } from "@/components/ui";

// SWR fetcher
const healthFetcher = () => fetchHealth();

export default function Dashboard() {
  const { ranking, connState, lastUpdated } = useRankingWS();
  const [selected, setSelected]             = useState<string | null>(null);
  const [httpRanking, setHttpRanking]       = useState<RankingItem[]>([]);

  // Health polling
  const { data: health } = useSWR<HealthStatus>("health", healthFetcher, {
    refreshInterval: 10_000,
  });

  // Fallback HTTP ranking for initial load (before WS delivers data)
  useEffect(() => {
    if (ranking.length === 0) {
      fetchRanking(20).then(setHttpRanking).catch(() => {});
    }
  }, []);

  const displayRanking = ranking.length > 0 ? ranking : httpRanking;
  const loading        = displayRanking.length === 0;

  // ── Summary stats ─────────────────────────────────────────────────────────
  const avgRoi    = displayRanking.length
    ? displayRanking.reduce((s, r) => s + r.roi_pct, 0) / displayRanking.length
    : 0;
  const longCount = displayRanking.filter(r => r.direction === "LONG").length;
  const shortCount= displayRanking.filter(r => r.direction === "SHORT").length;
  const topScore  = displayRanking[0]?.score ?? 0;

  return (
    <>
      <Head>
        <title>Futures AI Trend Bot</title>
        <meta name="description" content="AI-powered futures trend trading bot dashboard" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-bg-deep">
        <Header
          health={health ?? null}
          connState={connState}
          lastUpdated={lastUpdated}
        />

        <main className="max-w-screen-2xl mx-auto px-4 py-6 flex flex-col gap-6">

          {/* Hero */}
          {!selected && (
            <div className="flex items-end justify-between">
              <div>
                <h1 className="font-display font-bold text-2xl text-text-primary">
                  <span className="gradient-text">AI Trend</span> Dashboard
                </h1>
                <p className="text-sm text-text-muted mt-1">
                  Real-time futures trend analysis · EMA+RSI+ATR strategy · 5× leverage simulation
                </p>
              </div>

              {/* Market sentiment mini-bar */}
              {displayRanking.length > 0 && (
                <div className="hidden md:flex items-center gap-3 text-xs font-mono">
                  <span className="text-text-muted">Market bias</span>
                  <div className="flex items-center h-2 w-32 rounded overflow-hidden bg-bg-border">
                    <div
                      className="h-full bg-accent-green transition-all duration-700"
                      style={{ width: `${(longCount / (longCount + shortCount + 0.001)) * 100}%` }}
                    />
                    <div
                      className="h-full bg-accent-red transition-all duration-700"
                      style={{ width: `${(shortCount / (longCount + shortCount + 0.001)) * 100}%` }}
                    />
                  </div>
                  <span className="text-accent-green">{longCount}L</span>
                  <span className="text-accent-red">{shortCount}S</span>
                </div>
              )}
            </div>
          )}

          {/* Summary stats row */}
          {!selected && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Symbols Tracked"
                value={health?.symbols_tracked ?? "—"}
                sub="USDT perp futures"
                color="cyan"
              />
              <StatCard
                label="Avg ROI"
                value={`${avgRoi >= 0 ? "+" : ""}${avgRoi.toFixed(1)}%`}
                sub="backtest top-20"
                color={avgRoi >= 0 ? "green" : "red"}
              />
              <StatCard
                label="Top Score"
                value={topScore.toFixed(3)}
                sub={displayRanking[0]?.symbol?.split("/")[0] ?? "—"}
                color="amber"
              />
              <StatCard
                label="Scan #"
                value={health?.scan_count ?? "—"}
                sub={`${Math.floor((health?.uptime_s ?? 0) / 60)}m uptime`}
              />
            </div>
          )}

          {/* Main content */}
          {selected ? (
            <SymbolPanel
              symbol={selected}
              onClose={() => setSelected(null)}
            />
          ) : (
            <RankingTable
              data={displayRanking}
              loading={loading}
              onSelect={setSelected}
              selected={selected ?? undefined}
            />
          )}

          {/* Alert strip */}
          {!selected && displayRanking.length > 0 && (
            <div className="border border-bg-border rounded-xl px-4 py-3 bg-bg-card">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-accent-amber uppercase tracking-widest mr-2">
                  🔔 Top Opportunities
                </span>
                {displayRanking.slice(0, 5).map(r => (
                  <button
                    key={r.symbol}
                    onClick={() => setSelected(r.symbol)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-bg-border
                               bg-bg-panel hover:border-accent-cyan/40 hover:bg-accent-cyan/5
                               transition-all text-xs font-mono text-text-muted hover:text-text-primary"
                  >
                    <span>{r.symbol.split("/")[0]}</span>
                    <span className={r.roi_pct >= 0 ? "text-accent-green" : "text-accent-red"}>
                      {r.roi_pct >= 0 ? "+" : ""}{r.roi_pct.toFixed(1)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <footer className="text-center text-xs text-text-dim font-mono pb-4">
            Futures AI Trend Bot · Simulation only · Not financial advice · Public API data only
          </footer>
        </main>
      </div>
    </>
  );
}
