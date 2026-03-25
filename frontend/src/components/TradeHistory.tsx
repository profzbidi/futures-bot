// components/TradeHistory.tsx
import React from "react";
import clsx from "clsx";
import { TradeLog } from "@/lib/api";

interface Props { trades: TradeLog[] }

export default function TradeHistory({ trades }: Props) {
  if (!trades.length) {
    return (
      <div className="card p-8 text-center text-text-muted text-sm font-mono">
        No trades executed yet.
      </div>
    );
  }

  const reversed = [...trades].reverse().slice(0, 50);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
        <span className="text-sm font-display font-semibold text-text-primary">
          Trade History
        </span>
        <span className="text-xs font-mono text-text-muted">{trades.length} total</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-bg-border text-text-muted uppercase tracking-widest">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Dir</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">Exit</th>
              <th className="px-3 py-2 text-right">PnL %</th>
              <th className="px-3 py-2 text-right">PnL $</th>
              <th className="px-3 py-2 text-left">Reason</th>
            </tr>
          </thead>
          <tbody>
            {reversed.map((t, i) => {
              const win = t.pnl_abs > 0;
              return (
                <tr
                  key={i}
                  className={clsx(
                    "border-b border-bg-border/30",
                    "hover:bg-white/[0.02] transition-colors",
                  )}
                >
                  <td className="px-3 py-2 text-text-dim">{trades.length - i}</td>
                  <td className="px-3 py-2">
                    <span className={clsx(
                      "px-1.5 py-0.5 rounded text-xs",
                      t.direction === "LONG"
                        ? "bg-green-900/20 text-green-400"
                        : "bg-red-900/20 text-red-400",
                    )}>
                      {t.direction}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-text-primary">
                    {t.entry_price.toPrecision(6)}
                  </td>
                  <td className="px-3 py-2 text-right text-text-primary">
                    {t.exit_price.toPrecision(6)}
                  </td>
                  <td className={clsx("px-3 py-2 text-right font-semibold", win ? "text-accent-green" : "text-accent-red")}>
                    {win ? "+" : ""}{t.pnl_pct.toFixed(2)}%
                  </td>
                  <td className={clsx("px-3 py-2 text-right", win ? "text-accent-green" : "text-accent-red")}>
                    {win ? "+" : ""}{t.pnl_abs.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={clsx(
                      "px-1.5 py-0.5 rounded",
                      t.exit_reason === "TP"     ? "text-green-400"
                      : t.exit_reason === "SL"   ? "text-red-400"
                      : t.exit_reason === "TRAIL"? "text-amber-400"
                      : "text-text-muted",
                    )}>
                      {t.exit_reason}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
