// components/CandleChart.tsx
"use client";
import React, { useEffect, useRef } from "react";
import { Candle } from "@/lib/api";

interface Props {
  candles:  Candle[];
  symbol:   string;
  trades?:  { entry_idx: number; exit_idx: number; direction: string }[];
}

export default function CandleChart({ candles, symbol, trades = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current || !candles.length) return;

    // Dynamically import to avoid SSR issues
    import("lightweight-charts").then(({ createChart, CrosshairMode }) => {
      // Destroy existing chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      const chart = createChart(containerRef.current!, {
        layout: {
          background:  { color: "transparent" },
          textColor:   "#64748b",
          fontFamily:  "'JetBrains Mono', monospace",
          fontSize:    11,
        },
        grid: {
          vertLines:   { color: "#1a2640" },
          horzLines:   { color: "#1a2640" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine:  { color: "#334155", labelBackgroundColor: "#0d1729" },
          horzLine:  { color: "#334155", labelBackgroundColor: "#0d1729" },
        },
        rightPriceScale: {
          borderColor: "#1a2640",
        },
        timeScale: {
          borderColor:     "#1a2640",
          timeVisible:     true,
          secondsVisible:  false,
        },
        handleScroll:   { mouseWheel: true, pressedMouseMove: true },
        handleScale:    { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      });

      chartRef.current = chart;

      // ── Candlestick series ─────────────────────────────────────────────
      const candleSeries = chart.addCandlestickSeries({
        upColor:          "#00e676",
        downColor:        "#ff1744",
        borderUpColor:    "#00e676",
        borderDownColor:  "#ff1744",
        wickUpColor:      "#00e676",
        wickDownColor:    "#ff1744",
      });

      const candleData = candles.map(c => ({
        time:  Math.floor(c.t / 1000) as any,
        open:  c.o,
        high:  c.h,
        low:   c.l,
        close: c.c,
      }));
      candleSeries.setData(candleData);

      // ── EMA Fast ──────────────────────────────────────────────────────
      const emaFastSeries = chart.addLineSeries({
        color:       "#00e5ff",
        lineWidth:   1,
        title:       `EMA ${20}`,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      emaFastSeries.setData(
        candles
          .filter(c => c.ema_fast > 0)
          .map(c => ({ time: Math.floor(c.t / 1000) as any, value: c.ema_fast }))
      );

      // ── EMA Slow ──────────────────────────────────────────────────────
      const emaSlowSeries = chart.addLineSeries({
        color:       "#aa00ff",
        lineWidth:   1,
        title:       `EMA ${50}`,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      emaSlowSeries.setData(
        candles
          .filter(c => c.ema_slow > 0)
          .map(c => ({ time: Math.floor(c.t / 1000) as any, value: c.ema_slow }))
      );

      // ── Trade markers ─────────────────────────────────────────────────
      if (trades.length && candles.length) {
        const markers: any[] = [];
        for (const t of trades) {
          const entryCandle = candles[Math.min(t.entry_idx, candles.length - 1)];
          const exitCandle  = candles[Math.min(t.exit_idx,  candles.length - 1)];
          if (entryCandle) {
            markers.push({
              time:     Math.floor(entryCandle.t / 1000),
              position: t.direction === "LONG" ? "belowBar" : "aboveBar",
              color:    t.direction === "LONG" ? "#00e676" : "#ff1744",
              shape:    t.direction === "LONG" ? "arrowUp"  : "arrowDown",
              text:     t.direction === "LONG" ? "BUY"      : "SELL",
            });
          }
          if (exitCandle) {
            markers.push({
              time:     Math.floor(exitCandle.t / 1000),
              position: t.direction === "LONG" ? "aboveBar" : "belowBar",
              color:    "#ffc400",
              shape:    "circle",
              text:     "EXIT",
            });
          }
        }
        markers.sort((a, b) => a.time - b.time);
        candleSeries.setMarkers(markers);
      }

      // Fit to view
      chart.timeScale().fitContent();

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (containerRef.current) {
          chart.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
      ro.observe(containerRef.current!);

      return () => {
        ro.disconnect();
        chart.remove();
      };
    });
  }, [candles, trades]);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
        <span className="text-sm font-display font-semibold text-text-primary">
          {symbol} · 1H Chart
        </span>
        <div className="flex items-center gap-4 text-xs font-mono text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-cyan-400" />EMA 20
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-violet-500" />EMA 50
          </span>
          <span className="flex items-center gap-1">
            <span className="text-accent-green text-xs">▲</span> Buy
          </span>
          <span className="flex items-center gap-1">
            <span className="text-accent-red text-xs">▼</span> Sell
          </span>
        </div>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: 380 }} />
    </div>
  );
}
