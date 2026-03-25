"""
data_engine.py
──────────────
Fetches OHLCV candles from KuCoin Futures using CCXT async.
Supports multi-page pagination to build extended history, with
exponential-backoff retries and rate-limit awareness.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

import pandas as pd
import numpy as np
import ccxt.async_support as ccxt
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from config import settings

logger = logging.getLogger(__name__)


# ── Exchange factory (shared per-worker) ─────────────────────────────────────

def build_exchange() -> ccxt.kucoinfutures:
    return ccxt.kucoinfutures(
        {
            "enableRateLimit": True,
            "options": {"defaultType": "swap"},
            "rateLimit": 300,       # ms between requests
        }
    )


# ── Column names ─────────────────────────────────────────────────────────────
COLS = ["timestamp", "open", "high", "low", "close", "volume"]


async def fetch_ohlcv_paginated(
    exchange: ccxt.kucoinfutures,
    symbol: str,
    timeframe: str = settings.OHLCV_TIMEFRAME,
    total_candles: int = settings.OHLCV_HISTORY_CANDLES,
    limit_per_call: int = settings.OHLCV_LIMIT,
) -> pd.DataFrame:
    """
    Fetch `total_candles` OHLCV bars going back in time.
    Handles KuCoin's per-request cap with pagination.
    Returns DataFrame with columns [open, high, low, close, volume].
    Index is DatetimeIndex (UTC).
    """
    all_candles = []
    since: Optional[int] = None  # start from now going backwards

    # Work out timeframe in ms
    tf_ms = exchange.parse_timeframe(timeframe) * 1000  # seconds → ms

    # We need to page backwards
    fetched = 0
    now_ms = int(time.time() * 1000)
    since = now_ms - total_candles * tf_ms

    while fetched < total_candles:
        batch_limit = min(limit_per_call, total_candles - fetched)
        try:
            raw = await _fetch_with_retry(exchange, symbol, timeframe, since, batch_limit)
        except Exception as exc:
            logger.warning("Fetch failed for %s: %s", symbol, exc)
            break

        if not raw:
            break

        all_candles.extend(raw)
        fetched += len(raw)

        if len(raw) < batch_limit:
            break  # reached the end of available data

        # Advance window
        since = raw[-1][0] + tf_ms

        # Small delay to stay within rate limits (CCXT enforces, but be safe)
        await asyncio.sleep(0.1)

    if not all_candles:
        return pd.DataFrame(columns=COLS)

    df = pd.DataFrame(all_candles, columns=COLS)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df = df.drop_duplicates("timestamp").sort_values("timestamp")
    df = df.set_index("timestamp")
    df = df.astype(float)
    return df


@retry(
    retry=retry_if_exception_type((ccxt.NetworkError, ccxt.RequestTimeout, ccxt.ExchangeNotAvailable)),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    stop=stop_after_attempt(5),
    reraise=True,
)
async def _fetch_with_retry(
    exchange: ccxt.kucoinfutures,
    symbol: str,
    timeframe: str,
    since: Optional[int],
    limit: int,
) -> list:
    return await exchange.fetch_ohlcv(symbol, timeframe=timeframe, since=since, limit=limit)
