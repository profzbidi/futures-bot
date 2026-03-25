"""
main.py — FastAPI application entry point
──────────────────────────────────────────
Endpoints:
  GET /health          → system health
  GET /ranking         → top-N symbols ranked by composite score
  GET /symbol/{symbol} → full detail for one symbol
  GET /symbols         → list all tracked symbols
  WS  /ws/ranking      → WebSocket live ranking feed
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

import structlog
import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import settings
from engine import (
    start_live_loop,
    get_all_results,
    get_result,
    get_status,
)
from market_scanner import load_markets, get_cached_markets

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=settings.LOG_LEVEL)
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(
        getattr(logging, settings.LOG_LEVEL)
    )
)
logger = structlog.get_logger()


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-load markets on startup
    await load_markets()
    # Start the background scan loop
    asyncio.create_task(start_live_loop())
    logger.info("Bot started", env=settings.APP_ENV)
    yield
    logger.info("Bot shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Futures AI Trend Bot",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic response models ──────────────────────────────────────────────────

class RankingItem(BaseModel):
    rank:             int
    symbol:           str
    roi_pct:          float
    sharpe:           float
    calmar:           float
    max_drawdown_pct: float
    win_rate:         float
    trade_count:      int
    profit_factor:    float
    score:            float       # composite ranking score
    direction:        str         # current signal direction
    risk_score:       float


class SymbolDetail(BaseModel):
    symbol:           str
    timeframe:        str
    leverage:         float
    roi_pct:          float
    sharpe:           float
    calmar:           float
    max_drawdown_pct: float
    win_rate:         float
    trade_count:      int
    profit_factor:    float
    score:            float
    direction:        str
    risk_score:       float
    equity_curve:     List[float]
    trade_log:        List[dict]
    candles:          List[dict]  # OHLCV + indicators (last 200 bars)
    alerts:           List[str]


class HealthResponse(BaseModel):
    status:           str
    scan_count:       int
    symbols_tracked:  int
    last_run_ts:      float
    uptime_s:         float


# ── Helpers ───────────────────────────────────────────────────────────────────

_start_time = time.time()


def _composite_score(roi, sharpe, calmar, win_rate, profit_factor, dd) -> float:
    """
    Normalised composite score used for ranking.
    Higher is better.  All inputs clipped to finite range.
    """
    def _safe(v, lo, hi):
        if not math.isfinite(v):
            return 0.0
        return max(lo, min(hi, v))

    r  = _safe(roi,          -200, 500)   / 500
    s  = _safe(sharpe,       -5,   10)    / 10
    c  = _safe(calmar,       -5,   20)    / 20
    w  = _safe(win_rate,      0,    1)
    pf = _safe(profit_factor, 0,    5)    / 5
    d  = _safe(dd,            0,  100)    / 100

    return round(
        0.30 * r  +
        0.25 * s  +
        0.15 * c  +
        0.15 * w  +
        0.10 * pf -
        0.05 * d,
        6
    )


def _get_current_direction_and_risk(symbol: str):
    """Read the last indicator state from the engine's cached result."""
    result = get_result(symbol)
    if result is None:
        return "FLAT", 0.0
    # Use last trade direction as proxy for current bias
    if result.trade_log:
        last = result.trade_log[-1]
        direction = last["direction"]
    else:
        direction = "FLAT"

    # Risk score from last trade's relative PnL contribution
    risk_score = min(abs(result.roi_pct) / 100, 1.0)
    return direction, round(risk_score, 4)


def _build_alerts(item: RankingItem) -> List[str]:
    alerts = []
    if item.roi_pct > 50:
        alerts.append("🚀 Exceptional ROI — check for look-ahead bias")
    if item.max_drawdown_pct > 40:
        alerts.append("⚠️ High drawdown — elevated risk")
    if item.sharpe > 2.0:
        alerts.append("✅ Strong risk-adjusted return (Sharpe > 2)")
    if item.win_rate > 0.65:
        alerts.append("✅ High win rate")
    if item.trade_count < 5:
        alerts.append("ℹ️ Low trade count — limited statistical confidence")
    return alerts


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    status = get_status()
    return HealthResponse(
        status="ok" if status["scan_count"] > 0 else "warming_up",
        scan_count=status["scan_count"],
        symbols_tracked=status["symbols_tracked"],
        last_run_ts=status["last_run_ts"],
        uptime_s=round(time.time() - _start_time, 1),
    )


@app.get("/symbols", response_model=List[str])
async def list_symbols():
    return get_cached_markets()


@app.get("/ranking", response_model=List[RankingItem])
async def ranking(
    top: int = Query(default=settings.TOP_N, ge=1, le=200),
    min_trades: int = Query(default=3, ge=0),
):
    all_r = get_all_results()
    if not all_r:
        return []

    items: List[RankingItem] = []
    for sym, res in all_r.items():
        if res.trade_count < min_trades:
            continue
        direction, risk_score = _get_current_direction_and_risk(sym)
        score = _composite_score(
            res.roi_pct, res.sharpe, res.calmar,
            res.win_rate, res.profit_factor, res.max_drawdown_pct,
        )
        items.append(RankingItem(
            rank=0,
            symbol=sym,
            roi_pct=res.roi_pct,
            sharpe=res.sharpe,
            calmar=res.calmar,
            max_drawdown_pct=res.max_drawdown_pct,
            win_rate=res.win_rate,
            trade_count=res.trade_count,
            profit_factor=res.profit_factor,
            score=score,
            direction=direction,
            risk_score=risk_score,
        ))

    items.sort(key=lambda x: x.score, reverse=True)
    items = items[:top]
    for i, item in enumerate(items, 1):
        item.rank = i

    return items


@app.get("/symbol/{symbol:path}", response_model=SymbolDetail)
async def symbol_detail(symbol: str):
    # URL-decode slash in symbol names like BTC/USDT:USDT
    symbol = symbol.replace("%2F", "/")
    result = get_result(symbol)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found or not yet processed.")

    direction, risk_score = _get_current_direction_and_risk(symbol)
    score = _composite_score(
        result.roi_pct, result.sharpe, result.calmar,
        result.win_rate, result.profit_factor, result.max_drawdown_pct,
    )

    # Build candle data for chart
    candles: List[dict] = []
    if result.indicator_df is not None:
        df = result.indicator_df
        for ts, row in df.iterrows():
            candles.append({
                "t":        int(ts.timestamp() * 1000),
                "o":        round(float(row["open"]),     6),
                "h":        round(float(row["high"]),     6),
                "l":        round(float(row["low"]),      6),
                "c":        round(float(row["close"]),    6),
                "v":        round(float(row["volume"]),   2),
                "ema_fast": round(float(row.get("ema_fast", 0)), 6),
                "ema_slow": round(float(row.get("ema_slow", 0)), 6),
                "rsi":      round(float(row.get("rsi",    50)), 2),
                "atr":      round(float(row.get("atr",     0)), 6),
            })

    ri = RankingItem(
        rank=0, symbol=symbol,
        roi_pct=result.roi_pct, sharpe=result.sharpe, calmar=result.calmar,
        max_drawdown_pct=result.max_drawdown_pct, win_rate=result.win_rate,
        trade_count=result.trade_count, profit_factor=result.profit_factor,
        score=score, direction=direction, risk_score=risk_score,
    )

    return SymbolDetail(
        symbol=symbol,
        timeframe=result.timeframe,
        leverage=result.leverage,
        roi_pct=result.roi_pct,
        sharpe=result.sharpe,
        calmar=result.calmar,
        max_drawdown_pct=result.max_drawdown_pct,
        win_rate=result.win_rate,
        trade_count=result.trade_count,
        profit_factor=result.profit_factor,
        score=score,
        direction=direction,
        risk_score=risk_score,
        equity_curve=result.equity_curve,
        trade_log=result.trade_log,
        candles=candles,
        alerts=_build_alerts(ri),
    )


# ── WebSocket live feed ───────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: str):
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


@app.websocket("/ws/ranking")
async def ws_ranking(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            all_r = get_all_results()
            items = []
            for sym, res in all_r.items():
                if res.trade_count < 3:
                    continue
                direction, risk = _get_current_direction_and_risk(sym)
                score = _composite_score(
                    res.roi_pct, res.sharpe, res.calmar,
                    res.win_rate, res.profit_factor, res.max_drawdown_pct,
                )
                items.append({
                    "symbol": sym, "roi_pct": res.roi_pct,
                    "sharpe": res.sharpe, "score": score,
                    "direction": direction, "risk_score": risk,
                    "trade_count": res.trade_count,
                    "max_drawdown_pct": res.max_drawdown_pct,
                    "win_rate": res.win_rate,
                })
            items.sort(key=lambda x: x["score"], reverse=True)
            for i, item in enumerate(items[:settings.TOP_N], 1):
                item["rank"] = i

            await websocket.send_text(json.dumps(items[:settings.TOP_N]))
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        log_level=settings.LOG_LEVEL.lower(),
    )
