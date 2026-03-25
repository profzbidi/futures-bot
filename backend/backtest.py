"""
backtest.py
───────────
Realistic vectorised backtest engine.

Simulates:
  • Leverage (configurable per run)
  • Taker/maker fees on entry and exit
  • ATR-based stop-loss, take-profit, trailing stop
  • Position switching (no double-exposure)

Produces per-symbol statistics:
  • ROI %
  • Sharpe ratio (annualised, using hourly returns)
  • Calmar ratio
  • Max drawdown %
  • Win rate
  • Trade count
  • Equity curve
  • Trade log
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Literal, Optional, Tuple

import numpy as np
import pandas as pd

from config import settings
from strategy import Signal, compute_indicators, generate_signal


# ── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class Trade:
    entry_idx: int
    exit_idx:  int
    direction: Literal["LONG", "SHORT"]
    entry_price: float
    exit_price:  float
    leverage:    float
    pnl_pct:     float   # net PnL % of capital allocated
    pnl_abs:     float   # absolute PnL in USDT
    exit_reason: Literal["TP", "SL", "TRAIL", "SIGNAL", "END"]


@dataclass
class BacktestResult:
    symbol:         str
    timeframe:      str
    leverage:       float
    roi_pct:        float
    sharpe:         float
    calmar:         float
    max_drawdown_pct: float
    win_rate:       float
    trade_count:    int
    profit_factor:  float
    equity_curve:   List[float]      # one entry per bar
    trade_log:      List[dict]
    indicator_df:   Optional[pd.DataFrame] = None  # stripped for serialisation


# ── Core engine ──────────────────────────────────────────────────────────────

def run_backtest(
    df: pd.DataFrame,
    symbol: str,
    leverage: float = settings.DEFAULT_LEVERAGE,
    initial_capital: float = settings.INITIAL_CAPITAL,
) -> BacktestResult:
    """
    Walk forward through df bar by bar, applying the strategy signals.
    Returns a BacktestResult.
    """
    df = compute_indicators(df.copy())
    df = df.dropna()

    if len(df) < settings.MIN_CANDLES_REQUIRED:
        return _empty_result(symbol, leverage)

    # Pre-compute signals for every bar (vectorised indicators already there)
    n = len(df)
    closes  = df["close"].values
    highs   = df["high"].values
    lows    = df["low"].values
    atrs    = df["atr"].values
    ema_f   = df["ema_fast"].values
    ema_s   = df["ema_slow"].values
    rsi_v   = df["rsi"].values

    capital  = initial_capital
    equity_curve: List[float] = [capital]
    trades: List[Trade] = []

    # State
    in_position = False
    direction: Optional[Literal["LONG", "SHORT"]] = None
    entry_price  = 0.0
    stop_loss    = 0.0
    take_profit  = 0.0
    trail_delta  = 0.0
    best_price   = 0.0  # for trailing stop

    fee = settings.TAKER_FEE

    # We start from EMA_SLOW to have valid indicators
    start = settings.EMA_SLOW + settings.ATR_PERIOD + 5

    for i in range(start, n):
        c = closes[i]
        h = highs[i]
        lo = lows[i]
        atr = atrs[i]

        # ── Check open position exits ─────────────────────────────────────
        exit_reason: Optional[str] = None
        exit_price  = c

        if in_position and direction == "LONG":
            # Update trailing stop
            if c > best_price:
                best_price = c
                stop_loss = max(stop_loss, best_price - trail_delta)

            # Check SL / TP against bar extremes (pessimistic: SL first)
            if lo <= stop_loss:
                exit_price  = stop_loss
                exit_reason = "SL"
            elif h >= take_profit:
                exit_price  = take_profit
                exit_reason = "TP"

        elif in_position and direction == "SHORT":
            if c < best_price:
                best_price = c
                stop_loss = min(stop_loss, best_price + trail_delta)

            if h >= stop_loss:
                exit_price  = stop_loss
                exit_reason = "SL"
            elif lo <= take_profit:
                exit_price  = take_profit
                exit_reason = "TP"

        # ── Check signal for position switch or entry ─────────────────────
        new_dir = _bar_direction(ema_f[i], ema_s[i], rsi_v[i], c)

        if in_position and exit_reason is None:
            if new_dir != direction and new_dir != "FLAT":
                exit_reason = "SIGNAL"
                exit_price  = c

        # ── Execute exit ──────────────────────────────────────────────────
        if in_position and exit_reason:
            pnl_pct, pnl_abs = _calc_pnl(
                direction, entry_price, exit_price, leverage, fee, capital
            )
            capital += pnl_abs
            capital  = max(capital, 0.01)  # floor — avoid negative

            trades.append(Trade(
                entry_idx=i - 1, exit_idx=i,
                direction=direction,
                entry_price=entry_price,
                exit_price=exit_price,
                leverage=leverage,
                pnl_pct=pnl_pct,
                pnl_abs=pnl_abs,
                exit_reason=exit_reason,
            ))
            in_position = False

        # ── Execute entry ─────────────────────────────────────────────────
        if not in_position and new_dir != "FLAT":
            direction   = new_dir
            entry_price = c
            best_price  = c
            trail_delta = atr * settings.TRAIL_ATR_MULT

            if direction == "LONG":
                stop_loss   = c - atr * settings.SL_ATR_MULT
                take_profit = c + atr * settings.TP_ATR_MULT
            else:
                stop_loss   = c + atr * settings.SL_ATR_MULT
                take_profit = c - atr * settings.TP_ATR_MULT

            in_position = True

        equity_curve.append(capital)

    # Close any open position at last bar
    if in_position:
        c = closes[-1]
        pnl_pct, pnl_abs = _calc_pnl(
            direction, entry_price, c, leverage, fee, capital
        )
        capital += pnl_abs
        trades.append(Trade(
            entry_idx=n - 2, exit_idx=n - 1,
            direction=direction,
            entry_price=entry_price,
            exit_price=c,
            leverage=leverage,
            pnl_pct=pnl_pct,
            pnl_abs=pnl_abs,
            exit_reason="END",
        ))
        equity_curve.append(capital)

    # ── Metrics ───────────────────────────────────────────────────────────
    roi_pct         = (capital - initial_capital) / initial_capital * 100
    eq_arr          = np.array(equity_curve, dtype=float)
    max_dd_pct      = _max_drawdown(eq_arr)
    sharpe          = _sharpe(eq_arr)
    calmar          = _calmar(roi_pct, max_dd_pct)
    win_rate, pf    = _win_stats(trades)

    trade_log = [
        {
            "entry_idx":    t.entry_idx,
            "exit_idx":     t.exit_idx,
            "direction":    t.direction,
            "entry_price":  round(t.entry_price, 6),
            "exit_price":   round(t.exit_price, 6),
            "pnl_pct":      round(t.pnl_pct, 4),
            "pnl_abs":      round(t.pnl_abs, 4),
            "exit_reason":  t.exit_reason,
        }
        for t in trades
    ]

    # Attach indicator df for chart (keep small: last 200 bars)
    chart_df = df.tail(200).copy()

    return BacktestResult(
        symbol=symbol,
        timeframe=settings.OHLCV_TIMEFRAME,
        leverage=leverage,
        roi_pct=round(roi_pct, 4),
        sharpe=round(sharpe, 4),
        calmar=round(calmar, 4),
        max_drawdown_pct=round(max_dd_pct, 4),
        win_rate=round(win_rate, 4),
        trade_count=len(trades),
        profit_factor=round(pf, 4),
        equity_curve=[round(v, 2) for v in equity_curve],
        trade_log=trade_log,
        indicator_df=chart_df,
    )


# ── Helpers ──────────────────────────────────────────────────────────────────

def _bar_direction(ema_f, ema_s, rsi, close) -> Literal["LONG", "SHORT", "FLAT"]:
    bullish = ema_f > ema_s and close > ema_s
    bearish = ema_f < ema_s and close < ema_s
    rsi_ok  = settings.RSI_OVERSOLD < rsi < settings.RSI_OVERBOUGHT

    if bullish and rsi_ok and rsi > 45:
        return "LONG"
    if bearish and rsi_ok and rsi < 55:
        return "SHORT"
    return "FLAT"


def _calc_pnl(
    direction: str,
    entry: float,
    exit_: float,
    leverage: float,
    fee: float,
    capital: float,
) -> Tuple[float, float]:
    """Return (pnl_pct_of_capital, pnl_abs_usdt)."""
    if direction == "LONG":
        raw_pct = (exit_ - entry) / entry
    else:
        raw_pct = (entry - exit_) / entry

    # Fee on both legs (entry + exit) * leverage
    fee_total = fee * 2 * leverage
    net_pct   = raw_pct * leverage - fee_total

    # We risk full capital per trade (realistic for small accounts)
    pnl_abs   = capital * net_pct
    return net_pct * 100, pnl_abs


def _max_drawdown(equity: np.ndarray) -> float:
    """Maximum drawdown as a positive percentage."""
    peak = np.maximum.accumulate(equity)
    dd   = (peak - equity) / peak
    return float(dd.max() * 100) if len(dd) else 0.0


def _sharpe(equity: np.ndarray, bars_per_year: int = 8760) -> float:
    """Annualised Sharpe on bar-by-bar returns (hourly bars assumed)."""
    if len(equity) < 2:
        return 0.0
    returns = np.diff(equity) / equity[:-1]
    if returns.std() == 0:
        return 0.0
    return float(returns.mean() / returns.std() * math.sqrt(bars_per_year))


def _calmar(roi_pct: float, max_dd_pct: float) -> float:
    if max_dd_pct == 0:
        return 0.0
    return roi_pct / max_dd_pct


def _win_stats(trades: List[Trade]) -> Tuple[float, float]:
    if not trades:
        return 0.0, 0.0
    wins    = [t for t in trades if t.pnl_abs > 0]
    losses  = [t for t in trades if t.pnl_abs <= 0]
    win_r   = len(wins) / len(trades)
    gross_p = sum(t.pnl_abs for t in wins)
    gross_l = abs(sum(t.pnl_abs for t in losses)) or 1e-9
    pf      = gross_p / gross_l
    return win_r, pf


def _empty_result(symbol: str, leverage: float) -> BacktestResult:
    return BacktestResult(
        symbol=symbol,
        timeframe=settings.OHLCV_TIMEFRAME,
        leverage=leverage,
        roi_pct=0.0,
        sharpe=0.0,
        calmar=0.0,
        max_drawdown_pct=0.0,
        win_rate=0.0,
        trade_count=0,
        profit_factor=0.0,
        equity_curve=[settings.INITIAL_CAPITAL],
        trade_log=[],
    )
