# 🤖 Futures AI Trend Bot

A **production-grade, full-stack futures trend-following bot** that scans all USDT perpetual futures on KuCoin Futures (via public API only), runs continuous backtesting, and displays live rankings in a dark trading dashboard.

---

## ✨ Features

| Layer | What it does |
|---|---|
| **Market Scanner** | Loads all active USDT perp futures from KuCoin Futures (public API) |
| **Data Engine** | Paginated OHLCV fetching, incremental rolling updates, retry + exponential backoff |
| **AI Strategy** | EMA 20/50 trend + RSI filter + ATR-based dynamic SL/TP/trailing-stop |
| **Backtest Engine** | Realistic walk-forward with leverage, taker fees, trailing stops — produces ROI, Sharpe, Calmar, max DD, win rate |
| **Parallel Engine** | Async semaphore pool (10 workers), 60s scan interval, in-memory rolling cache |
| **FastAPI Backend** | `/ranking`, `/symbol/{sym}`, `/health`, `/symbols`, `WS /ws/ranking` |
| **Next.js Dashboard** | Live ranking table, candlestick chart + EMA lines, equity curve, trade history |
| **GCP Deploy** | Cloud Run (backend) + Vercel (frontend) + optional Cloud Scheduler keepalive |

---

## 🚀 Quick Start (Local)

```bash
# Clone
git clone https://github.com/YOUR_ORG/futures-bot.git
cd futures-bot

# Backend
cd backend
cp .env.example .env
pip install -r requirements.txt
uvicorn main:app --reload --port 8080

# Frontend (new terminal)
cd ../frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000 — the bot needs ~2–3 minutes to complete the first scan.

### Docker Compose (recommended)

```bash
docker-compose up --build
```

---

## 📁 Project Structure

```
futures-bot/
├── backend/
│   ├── main.py          # FastAPI app + endpoints + WebSocket
│   ├── engine.py        # Parallel async engine + live loop
│   ├── backtest.py      # Walk-forward backtest engine
│   ├── strategy.py      # EMA/RSI/ATR indicator + signal logic
│   ├── data_engine.py   # OHLCV fetching + pagination + retry
│   ├── market_scanner.py# KuCoin market discovery + cache
│   ├── config.py        # Pydantic settings (env vars)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/index.tsx      # Main dashboard
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── RankingTable.tsx
│   │   │   ├── SymbolPanel.tsx
│   │   │   ├── CandleChart.tsx  # lightweight-charts
│   │   │   ├── EquityCurve.tsx  # Recharts
│   │   │   ├── TradeHistory.tsx
│   │   │   └── ui.tsx
│   │   ├── hooks/useRankingWS.ts
│   │   └── lib/api.ts
│   ├── package.json
│   └── Dockerfile
├── docs/
│   ├── DEPLOYMENT.md    # Full GCP deployment guide
│   └── ARCHITECTURE.md  # Diagrams + optimization guide
└── docker-compose.yml
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | System status, scan count, uptime |
| GET | `/symbols` | All tracked symbols |
| GET | `/ranking?top=20&min_trades=3` | Top-N ranked symbols |
| GET | `/symbol/{sym}` | Full detail: metrics, equity, trades, candles |
| WS | `/ws/ranking` | Live ranking feed (updates every 5s) |

---

## ⚙️ Configuration (Environment Variables)

| Variable | Default | Description |
|---|---|---|
| `SCAN_INTERVAL_SECONDS` | 60 | How often to re-scan all symbols |
| `MAX_CONCURRENT_SYMBOLS` | 10 | Parallel workers |
| `MAX_SYMBOLS` | 80 | Max symbols to scan per cycle |
| `DEFAULT_LEVERAGE` | 5.0 | Simulated leverage for backtest |
| `OHLCV_TIMEFRAME` | 1h | Candle interval |
| `OHLCV_HISTORY_CANDLES` | 500 | History depth per symbol |
| `TOP_N` | 20 | Default ranking size |
| `REDIS_URL` | (none) | Optional Redis for result caching |

---

## ⚠️ Disclaimer

This system is for **educational and research purposes only**. It uses public API data and simulates trading — it does **not** execute real trades, and nothing here constitutes financial advice.

---

## 📄 License

MIT
