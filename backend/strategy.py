"""
strategy.py
───────────
AI Trend-Following Strategy
────────────────────────────
Indicators:
  • EMA 20 / EMA 50 (trend)
  • RSI 14 (momentum filter)
  • ATR 14 (volatility — stop/target sizing)

Signal logic:
  LONG  : EMA_fast > EMA_slow  AND  close > EMA_slow  AND  RSI < RSI_OVERBOUGHT  AND  RSI > 45
  SHORT : EMA_fast < EMA_slow  AND  close < EMA_slow  AND  RSI > RSI_OVERSOLD    AND  RSI < 55

Each signal carries:
  • entry price
  • stop-loss  (ATR-based)
  • take-profit (ATR-based)
  • trailing-stop delta (ATR-based)
  • risk_score  ∈ [0, 1]  (composite of trend strength + RSI distance + volatility norm)
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Literal, Optional

from config import settings


@dataclass
class Signal:
    direction: Literal["LONG", "SHORT", "FLAT"]
    entry: float
    stop_loss: float
    take_profit: float
    trailing_stop_delta: float
    risk_score: float                   # 0 = low risk/confidence, 1 = high
    ema_fast: float = 0.0
    ema_slow: float = 0.0
    rsi: float = 50.0
    atr: float = 0.0


def _ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def _rsi(series: pd.Series, period: int) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, adjust=False).mean()
    avg_loss = loss.ewm(com=period - 1, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int) -> pd.Series:
    hl = high - low
    hc = (high - close.shift(1)).abs()
    lc = (low - close.shift(1)).abs()
    tr = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    return tr.ewm(com=period - 1, adjust=False).mean()


def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Attach indicator columns to a copy of df."""
    df = df.copy()
    df["ema_fast"] = _ema(df["close"], settings.EMA_FAST)
    df["ema_slow"] = _ema(df["close"], settings.EMA_SLOW)
    df["rsi"]      = _rsi(df["close"], settings.RSI_PERIOD)
    df["atr"]      = _atr(df["high"], df["low"], df["close"], settings.ATR_PERIOD)
    return df


def generate_signal(df: pd.DataFrame) -> Signal:
    """
    Produce a Signal from the most-recent complete candle.
    Requires df to already have indicator columns (via compute_indicators).
    """
    if len(df) < settings.EMA_SLOW + 10:
        return Signal(
            direction="FLAT", entry=df["close"].iloc[-1],
            stop_loss=0, take_profit=0, trailing_stop_delta=0, risk_score=0,
        )

    last = df.iloc[-1]
    prev = df.iloc[-2]

    ema_fast  = last["ema_fast"]
    ema_slow  = last["ema_slow"]
    rsi       = last["rsi"]
    atr       = last["atr"]
    close     = last["close"]

    # ── Trend filters ────────────────────────────────────────────────────────
    bullish_trend = (ema_fast > ema_slow) and (close > ema_slow)
    bearish_trend = (ema_fast < ema_slow) and (close < ema_slow)

    # EMA cross (extra confirmation)
    prev_bull = prev["ema_fast"] > prev["ema_slow"]
    ema_cross_up   = (not prev_bull) and bullish_trend
    ema_cross_down = prev_bull and bearish_trend

    # ── RSI filters ──────────────────────────────────────────────────────────
    rsi_ok_long  = settings.RSI_OVERSOLD  < rsi < settings.RSI_OVERBOUGHT
    rsi_ok_short = settings.RSI_OVERSOLD  < rsi < settings.RSI_OVERBOUGHT

    # ── Direction decision ───────────────────────────────────────────────────
    if bullish_trend and rsi_ok_long and rsi > 45:
        direction = "LONG"
        stop_loss     = close - atr * settings.SL_ATR_MULT
        take_profit   = close + atr * settings.TP_ATR_MULT
    elif bearish_trend and rsi_ok_short and rsi < 55:
        direction = "SHORT"
        stop_loss     = close + atr * settings.SL_ATR_MULT
        take_profit   = close - atr * settings.TP_ATR_MULT
    else:
        return Signal(
            direction="FLAT", entry=close,
            stop_loss=0, take_profit=0, trailing_stop_delta=0,
            risk_score=0, ema_fast=ema_fast, ema_slow=ema_slow,
            rsi=rsi, atr=atr,
        )

    trailing_stop_delta = atr * settings.TRAIL_ATR_MULT

    # ── Risk score ───────────────────────────────────────────────────────────
    # Trend strength: normalised EMA spread
    ema_spread = abs(ema_fast - ema_slow) / ema_slow  # fraction
    trend_strength = min(ema_spread / 0.02, 1.0)       # cap at 2 % spread

    # RSI distance from centre (50): closer to centre → higher confidence
    rsi_distance = abs(rsi - 50) / 50
    rsi_score = 1.0 - rsi_distance                     # higher = less extreme

    # Volatility normalised by price: lower = cleaner signal
    vol_norm = min(atr / close / 0.03, 1.0)
    vol_score = 1.0 - vol_norm

    risk_score = round(0.5 * trend_strength + 0.3 * rsi_score + 0.2 * vol_score, 4)

    return Signal(
        direction=direction,
        entry=close,
        stop_loss=stop_loss,
        take_profit=take_profit,
        trailing_stop_delta=trailing_stop_delta,
        risk_score=risk_score,
        ema_fast=ema_fast,
        ema_slow=ema_slow,
        rsi=rsi,
        atr=atr,
    )
