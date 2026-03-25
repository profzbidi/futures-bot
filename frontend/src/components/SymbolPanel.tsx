// components/SymbolPanel.tsx
"use client";
import React, { useEffect, useState } from "react";
import { fetchSymbolDetail, SymbolDetail } from "@/lib/api";
import { StatCard, DirectionBadge, Skeleton, Pill } from "./ui";
import CandleChart from "./CandleChart";
import EquityCurve from "./EquityCurve";
import TradeHistory from "./TradeHistory";
import clsx from "clsx";

interface Props { symbol: string; onClose: () => void }

export default function SymbolPanel({ symbol, onClose }: Props) {
  const [detail, setDetail]   = useState<SymbolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<"chart" | "trades">("chart");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSymbolDetail(symbol)
      .then(d => { setDetail(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [symbol]);

  return (
    <div className="flex flex-col gap-4 animate-slideUp">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-sm font-mono"
          >
            ← Back
          </button>
          <h2 className="font-display font-bold text-xl text-text-primary">
            {symbol.split("/")[0]}
            <span className="text-text-muted font-normal text-base">/USDT</span>
          </h2>
          {detail && <DirectionBadge dir={detail.direction} />}
        </div>

        {detail && (
          <div className="flex items-center gap-2 text-xs font-mono text-text-muted">
            <span>{detail.timeframe} bars</span>
            <span>·</span>
            <span>{detail.leverage}× lev</span>
          </div>
        )}
      </div>

      {/* Alerts */}
      {detail?.alerts?.length ? (
        <div className="flex flex-wrap gap-2">
          {detail.alerts.map((a, i) => (
            <span key={i} className="text-xs px-2.5 py-1 rounded bg-bg-card border border-bg-border text-text-muted">
              {a}
            </span>
          ))}
        </div>
      ) : null}

      {/* Metrics grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="card p-6 text-accent-red text-sm font-mono">{error}</div>
      ) : detail ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="ROI"
              value={`${detail.roi_pct >= 0 ? "+" : ""}${detail.roi_pct.toFixed(2)}%`}
              color={detail.roi_pct >= 0 ? "green" : "red"}
            />
            <StatCard
              label="Sharpe"
              value={detail.sharpe.toFixed(2)}
              color={detail.sharpe >= 1.5 ? "green" : detail.sharpe >= 0 ? "cyan" : "red"}
            />
            <StatCard
              label="Max Drawdown"
              value={`-${detail.max_drawdown_pct.toFixed(1)}%`}
              color={detail.max_drawdown_pct > 30 ? "red" : detail.max_drawdown_pct > 15 ? "amber" : "green"}
            />
            <StatCard
              label="Win Rate"
              value={`${(detail.win_rate * 100).toFixed(1)}%`}
              color={detail.win_rate >= 0.55 ? "green" : detail.win_rate >= 0.45 ? "cyan" : "red"}
            />
            <StatCard
              label="Trades"
              value={detail.trade_count}
              sub="backtest total"
            />
            <StatCard
              label="Profit Factor"
              value={detail.profit_factor.toFixed(2)}
              color={detail.profit_factor >= 1.5 ? "green" : detail.profit_factor >= 1 ? "amber" : "red"}
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-bg-border pb-0">
            {(["chart", "trades"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  "px-4 py-2 text-sm font-mono uppercase tracking-wider border-b-2 transition-colors",
                  tab === t
                    ? "text-accent-cyan border-accent-cyan"
                    : "text-text-muted border-transparent hover:text-text-primary",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "chart" ? (
            <>
              <CandleChart
                candles={detail.candles}
                symbol={symbol}
                trades={detail.trade_log}
              />
              <EquityCurve
                equity={detail.equity_curve}
                initial={10000}
              />
            </>
          ) : (
            <TradeHistory trades={detail.trade_log} />
          )}
        </>
      ) : null}
    </div>
  );
}
