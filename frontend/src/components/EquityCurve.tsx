// components/EquityCurve.tsx
"use client";
import React from "react";
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";

interface Props {
  equity:  number[];
  initial: number;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const val: number = payload[0].value;
  return (
    <div className="card px-3 py-2 text-xs font-mono border-bg-border">
      <div className="text-text-muted">Equity</div>
      <div className={val >= 10000 ? "text-accent-green" : "text-accent-red"}>
        ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
};

export default function EquityCurve({ equity, initial }: Props) {
  const data = equity.map((v, i) => ({ bar: i, equity: v }));
  const min  = Math.min(...equity) * 0.98;
  const max  = Math.max(...equity) * 1.02;
  const final = equity[equity.length - 1] ?? initial;
  const positive = final >= initial;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
        <span className="text-sm font-display font-semibold text-text-primary">
          Equity Curve
        </span>
        <span className={`text-xs font-mono font-bold ${positive ? "text-accent-green" : "text-accent-red"}`}>
          ${final.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          {" "}
          ({positive ? "+" : ""}{(((final - initial) / initial) * 100).toFixed(2)}%)
        </span>
      </div>

      <div className="p-2" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={positive ? "#00e676" : "#ff1744"} stopOpacity={0.25} />
                <stop offset="95%" stopColor={positive ? "#00e676" : "#ff1744"} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1a2640" strokeDasharray="3 3" />
            <XAxis dataKey="bar" hide />
            <YAxis
              domain={[min, max]}
              tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
              width={48}
              tick={{ fontSize: 10, fill: "#64748b", fontFamily: "JetBrains Mono" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={initial}
              stroke="#334155"
              strokeDasharray="4 4"
              label={{ value: "Start", fill: "#64748b", fontSize: 10 }}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke={positive ? "#00e676" : "#ff1744"}
              strokeWidth={1.5}
              fill="url(#eqGrad)"
              dot={false}
              activeDot={{ r: 3, fill: positive ? "#00e676" : "#ff1744" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
