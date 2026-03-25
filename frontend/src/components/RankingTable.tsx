// components/RankingTable.tsx
import React, { useState } from "react";
import clsx from "clsx";
import { RankingItem } from "@/lib/api";
import { DirectionBadge, RoiCell, RiskBar, ScoreBar, Skeleton } from "./ui";

type SortKey = keyof RankingItem;

interface Props {
  data:       RankingItem[];
  loading:    boolean;
  onSelect:   (symbol: string) => void;
  selected?:  string;
}

export default function RankingTable({ data, loading, onSelect, selected }: Props) {
  const [sortKey, setSortKey]   = useState<SortKey>("rank");
  const [sortAsc, setSortAsc]   = useState(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sorted = [...data].sort((a, b) => {
    const va = a[sortKey] as number | string;
    const vb = b[sortKey] as number | string;
    if (typeof va === "number" && typeof vb === "number") {
      return sortAsc ? va - vb : vb - va;
    }
    return sortAsc
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  const cols: { key: SortKey; label: string; className?: string }[] = [
    { key: "rank",             label: "#",          className: "w-10 text-center" },
    { key: "symbol",           label: "Symbol" },
    { key: "direction",        label: "Signal",     className: "w-28" },
    { key: "roi_pct",          label: "ROI %",      className: "w-28 text-right" },
    { key: "sharpe",           label: "Sharpe",     className: "w-24 text-right" },
    { key: "max_drawdown_pct", label: "Max DD",     className: "w-24 text-right" },
    { key: "win_rate",         label: "Win %",      className: "w-24 text-right" },
    { key: "trade_count",      label: "Trades",     className: "w-20 text-right" },
    { key: "score",            label: "Score",      className: "w-36" },
    { key: "risk_score",       label: "Risk",       className: "w-28" },
  ];

  return (
    <div className="card overflow-hidden animate-fadeIn">
      {/* Table header */}
      <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
        <span className="text-sm font-display font-semibold text-text-primary">
          Live Rankings
        </span>
        <span className="text-xs font-mono text-text-muted">
          {data.length} symbols · 5x leverage · 1h bars
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bg-border">
              {cols.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={clsx(
                    "px-3 py-2.5 text-left text-xs font-mono font-medium text-text-muted",
                    "uppercase tracking-widest cursor-pointer select-none",
                    "hover:text-accent-cyan transition-colors",
                    col.className,
                  )}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 text-accent-cyan">{sortAsc ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading && data.length === 0
              ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-bg-border/50">
                    {cols.map(c => (
                      <td key={c.key} className="px-3 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map(row => (
                  <tr
                    key={row.symbol}
                    onClick={() => onSelect(row.symbol)}
                    className={clsx(
                      "border-b border-bg-border/40 table-row-hover transition-colors",
                      selected === row.symbol && "bg-accent-cyan/5 !border-accent-cyan/20",
                    )}
                  >
                    {/* Rank */}
                    <td className="px-3 py-3 text-center">
                      <span className={clsx(
                        "text-xs font-mono font-bold",
                        row.rank <= 3 ? "text-accent-amber" : "text-text-muted",
                      )}>
                        {row.rank <= 3 ? ["🥇","🥈","🥉"][row.rank - 1] : `#${row.rank}`}
                      </span>
                    </td>

                    {/* Symbol */}
                    <td className="px-3 py-3">
                      <div className="flex flex-col">
                        <span className="font-mono font-semibold text-text-primary text-sm">
                          {row.symbol.split("/")[0]}
                        </span>
                        <span className="text-xs text-text-muted">/USDT</span>
                      </div>
                    </td>

                    {/* Signal */}
                    <td className="px-3 py-3">
                      <DirectionBadge dir={row.direction} />
                    </td>

                    {/* ROI */}
                    <td className="px-3 py-3 text-right">
                      <RoiCell value={row.roi_pct} />
                    </td>

                    {/* Sharpe */}
                    <td className="px-3 py-3 text-right">
                      <span className={clsx(
                        "font-mono text-sm",
                        row.sharpe >= 1.5 ? "text-accent-green"
                          : row.sharpe >= 0 ? "text-text-primary"
                          : "text-accent-red",
                      )}>
                        {row.sharpe.toFixed(2)}
                      </span>
                    </td>

                    {/* Max DD */}
                    <td className="px-3 py-3 text-right">
                      <span className={clsx(
                        "font-mono text-sm",
                        row.max_drawdown_pct > 30 ? "text-accent-red"
                          : row.max_drawdown_pct > 15 ? "text-accent-amber"
                          : "text-accent-green",
                      )}>
                        -{row.max_drawdown_pct.toFixed(1)}%
                      </span>
                    </td>

                    {/* Win rate */}
                    <td className="px-3 py-3 text-right">
                      <span className="font-mono text-sm text-text-primary">
                        {(row.win_rate * 100).toFixed(1)}%
                      </span>
                    </td>

                    {/* Trades */}
                    <td className="px-3 py-3 text-right">
                      <span className="font-mono text-sm text-text-muted">
                        {row.trade_count}
                      </span>
                    </td>

                    {/* Score */}
                    <td className="px-3 py-3">
                      <ScoreBar value={row.score} />
                    </td>

                    {/* Risk */}
                    <td className="px-3 py-3">
                      <RiskBar value={row.risk_score} />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
