# ══════════════════════════════════════════════════════════════════════════════
#  Futures AI Trend Bot — Architecture & Optimization Guide
# ══════════════════════════════════════════════════════════════════════════════

## System Architecture (ASCII Diagram)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          FUTURES AI TREND BOT                            │
└──────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐      Public REST/WS       ┌────────────────────────────┐
  │             │ ◄──────────────────────── │                            │
  │  Next.js    │                           │      FastAPI Backend        │
  │  Frontend   │ ──── GET /ranking ──────► │   (Cloud Run, always-on)   │
  │  (Vercel)   │ ──── GET /symbol/X ─────► │                            │
  │             │ ──── WS /ws/ranking ────► │                            │
  └─────────────┘                           └────────────┬───────────────┘
                                                         │
                           ┌─────────────────────────────┼─────────────────┐
                           │                             │                 │
                  ┌────────▼──────┐           ┌──────────▼──────┐  ┌──────▼──────┐
                  │  Market       │           │  Parallel Async  │  │  Strategy   │
                  │  Scanner      │           │  Engine          │  │  + Backtest │
                  │               │           │  (semaphore      │  │  Engine     │
                  │  KuCoin Fut.  │           │   10 workers)    │  │             │
                  │  USDT Perps   │           └──────────┬───────┘  └──────┬──────┘
                  └───────────────┘                      │                 │
                                                         │                 │
                                            ┌────────────▼─────────────────▼──────┐
                                            │         Data Engine                  │
                                            │  CCXT kucoinfutures (public API)     │
                                            │  • Paginated OHLCV fetch             │
                                            │  • Incremental rolling cache         │
                                            │  • Retry + exponential backoff       │
                                            └────────────────────────────────────-─┘
                                                         │
                                            ┌────────────▼──────────────────────────┐
                                            │    KuCoin Futures Public API           │
                                            │    (no API keys required)              │
                                            └───────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────┐
  │                         DATA FLOW PER CYCLE (60s)                        │
  │                                                                           │
  │  1. market_scanner  → fetch/cache USDT perp symbols (30 min TTL)        │
  │  2. engine          → dispatch up to 80 symbols × async workers         │
  │  3. data_engine     → incremental OHLCV top-up (only new candles)       │
  │  4. strategy        → compute EMA/RSI/ATR indicators on each df         │
  │  5. backtest        → walk-forward simulation → metrics                  │
  │  6. engine._results → updated dict[symbol → BacktestResult]             │
  │  7. /ranking API    → sort by composite score, return top-N             │
  │  8. WS broadcast    → push updated ranking to all connected clients     │
  └──────────────────────────────────────────────────────────────────────────┘
```

## Composite Ranking Score Formula

```
score = 0.30 × roi_norm       (ROI %, normalised 0–500 %)
      + 0.25 × sharpe_norm    (Sharpe, normalised 0–10)
      + 0.15 × calmar_norm    (Calmar ratio, normalised 0–20)
      + 0.15 × win_rate       (already 0–1)
      + 0.10 × pf_norm        (profit factor, normalised 0–5)
      - 0.05 × dd_norm        (drawdown penalty, normalised 0–100%)
```

## Strategy Signal Logic

```
LONG  when:
  EMA_20 > EMA_50
  close  > EMA_50       (price above slow trend)
  45 < RSI < 65         (momentum confirmed, not overbought)

SHORT when:
  EMA_20 < EMA_50
  close  < EMA_50
  35 < RSI < 55         (not oversold)

Exit conditions (whichever fires first):
  Take-Profit  : price reaches entry ± ATR × 2.5
  Stop-Loss    : price reaches entry ∓ ATR × 1.5
  Trailing Stop: best_price ∓ ATR × 1.2 (moves with price, never backwards)
  Signal flip  : opposite direction signal generated
```

## Optimization Suggestions

### Performance

1. **Redis caching** — Serialise BacktestResult to JSON, store in Redis with 55s TTL.
   Eliminates recalculation if `/ranking` is hit more often than the scan interval.

2. **Numba JIT** — Decorate hot loops in `backtest.py` with `@numba.njit` for
   3–10× speedup on the walk-forward simulation.

3. **Pandas vectorisation** — Replace the Python for-loop in `run_backtest`
   with vectorised NumPy operations (signal arrays, cumulative equity).

4. **Symbol tiering** — Scan top-30 (by 24h volume) every 60s, remainder every 5m.

5. **Candle streaming** — Replace polling with KuCoin WebSocket candle feed for
   zero-latency updates (`exchange.watch_ohlcv` in CCXT Pro).

### Strategy Quality

6. **Multi-timeframe confirmation** — Generate signals on 1H, confirm on 4H.
   Dramatically reduces false positives in choppy markets.

7. **Volume filter** — Require volume > EMA(volume, 20) to confirm breakout.

8. **Volatility regime** — ATR percentile ranking: skip signals during top-10 %
   volatility (high spread, unpredictable) and bottom-10 % (no momentum).

9. **ML placeholder** — `strategy.py` exposes a `risk_score` field.
   Replace the heuristic with an XGBoost or LightGBM model trained on
   feature vectors [ema_spread, rsi, atr_pct, volume_ratio, hour_of_day].

### Risk Management

10. **Kelly sizing** — Replace fixed leverage with Kelly-fraction position sizing
    based on historical win_rate and avg_win/avg_loss per symbol.

11. **Portfolio-level drawdown circuit breaker** — If aggregate portfolio
    drawdown exceeds X%, halt new entries until next scan cycle.

12. **Correlation filter** — BTC and ETH futures are highly correlated. Limit
    exposure to ≤2 correlated symbols simultaneously.

### Operational

13. **Structured logging** — Already using `structlog`. Ship logs to
    Google Cloud Logging → set up Log-Based Alerts for ERROR events.

14. **Prometheus metrics** — Expose `/metrics` endpoint with scan latency,
    symbols processed, error counts. Scrape with Cloud Monitoring.

15. **Secret Manager** — Store any future API keys in GCP Secret Manager.
    Mount as env vars in Cloud Run via `--set-secrets`.
