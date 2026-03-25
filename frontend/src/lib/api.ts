// lib/api.ts — typed API client

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const WS   = process.env.NEXT_PUBLIC_WS_URL  ?? "ws://localhost:8080";

export { WS };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RankingItem {
  rank:             number;
  symbol:           string;
  roi_pct:          number;
  sharpe:           number;
  calmar:           number;
  max_drawdown_pct: number;
  win_rate:         number;
  trade_count:      number;
  profit_factor:    number;
  score:            number;
  direction:        "LONG" | "SHORT" | "FLAT";
  risk_score:       number;
}

export interface Candle {
  t:        number;
  o:        number;
  h:        number;
  l:        number;
  c:        number;
  v:        number;
  ema_fast: number;
  ema_slow: number;
  rsi:      number;
  atr:      number;
}

export interface SymbolDetail extends RankingItem {
  timeframe:    string;
  leverage:     number;
  equity_curve: number[];
  trade_log:    TradeLog[];
  candles:      Candle[];
  alerts:       string[];
}

export interface TradeLog {
  entry_idx:   number;
  exit_idx:    number;
  direction:   "LONG" | "SHORT";
  entry_price: number;
  exit_price:  number;
  pnl_pct:     number;
  pnl_abs:     number;
  exit_reason: string;
}

export interface HealthStatus {
  status:          string;
  scan_count:      number;
  symbols_tracked: number;
  last_run_ts:     number;
  uptime_s:        number;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

export async function fetchRanking(top = 20, minTrades = 3): Promise<RankingItem[]> {
  const res = await fetch(`${BASE}/ranking?top=${top}&min_trades=${minTrades}`);
  if (!res.ok) throw new Error(`/ranking returned ${res.status}`);
  return res.json();
}

export async function fetchSymbolDetail(symbol: string): Promise<SymbolDetail> {
  const encoded = encodeURIComponent(symbol);
  const res = await fetch(`${BASE}/symbol/${encoded}`);
  if (!res.ok) throw new Error(`/symbol/${symbol} returned ${res.status}`);
  return res.json();
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error(`/health returned ${res.status}`);
  return res.json();
}

export async function fetchSymbols(): Promise<string[]> {
  const res = await fetch(`${BASE}/symbols`);
  if (!res.ok) throw new Error(`/symbols returned ${res.status}`);
  return res.json();
}
