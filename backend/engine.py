"""
engine.py
─────────
Parallel async engine that processes all symbols concurrently,
respecting KuCoin API rate limits via a semaphore-controlled worker pool.

State management:
  - _results: dict[symbol → BacktestResult]  — refreshed every cycle
  - _df_cache: dict[symbol → DataFrame]      — rolling OHLCV cache
  - _last_run_ts / _running: bookkeeping

Live loop (start_live_loop):
  - Runs indefinitely, sleeping SCAN_INTERVAL_SECONDS between cycles.
  - On each cycle, fetches only the latest candles (incremental update)
    for symbols already in cache, or full history for new ones.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Dict, Optional

import pandas as pd
import ccxt.async_support as ccxt

from config import settings
from data_engine import build_exchange, fetch_ohlcv_paginated
from backtest import run_backtest, BacktestResult
from strategy import compute_indicators, generate_signal
from market_scanner import load_markets

logger = logging.getLogger(__name__)

# ── Shared state (module-level singletons) ────────────────────────────────────
_results:     Dict[str, BacktestResult] = {}
_df_cache:    Dict[str, pd.DataFrame]   = {}
_last_run_ts: float = 0.0
_running:     bool  = False
_scan_count:  int   = 0


# ── Public accessors ─────────────────────────────────────────────────────────

def get_all_results() -> Dict[str, BacktestResult]:
    return _results.copy()


def get_result(symbol: str) -> Optional[BacktestResult]:
    return _results.get(symbol)


def get_status() -> dict:
    return {
        "running":          _running,
        "last_run_ts":      _last_run_ts,
        "scan_count":       _scan_count,
        "symbols_tracked":  len(_results),
        "symbols_cached":   len(_df_cache),
    }


# ── Live loop ─────────────────────────────────────────────────────────────────

async def start_live_loop() -> None:
    """Starts the continuous scan loop. Call once at startup."""
    global _running, _scan_count
    _running = True
    logger.info("Live loop started.")

    while _running:
        try:
            await _run_scan_cycle()
        except Exception as exc:
            logger.error("Scan cycle error: %s", exc, exc_info=True)

        await asyncio.sleep(settings.SCAN_INTERVAL_SECONDS)


async def _run_scan_cycle() -> None:
    global _last_run_ts, _scan_count

    logger.info("─── Scan cycle #%d starting ───", _scan_count + 1)
    t0 = time.perf_counter()

    symbols = await load_markets()
    if not symbols:
        logger.warning("No symbols loaded — skipping cycle.")
        return

    semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_SYMBOLS)
    tasks = [_process_symbol(sym, semaphore) for sym in symbols]
    await asyncio.gather(*tasks, return_exceptions=True)

    _last_run_ts = time.time()
    _scan_count += 1
    elapsed = time.perf_counter() - t0
    logger.info("─── Cycle #%d done in %.1fs — %d results ───",
                _scan_count, elapsed, len(_results))


async def _process_symbol(symbol: str, sem: asyncio.Semaphore) -> None:
    async with sem:
        exchange = build_exchange()
        try:
            df = await _get_df(exchange, symbol)
            if df is None or len(df) < settings.MIN_CANDLES_REQUIRED:
                return

            result = await asyncio.get_event_loop().run_in_executor(
                None, run_backtest, df, symbol, settings.DEFAULT_LEVERAGE
            )
            _results[symbol] = result

        except ccxt.BadSymbol:
            logger.debug("Bad symbol: %s", symbol)
        except Exception as exc:
            logger.warning("Error processing %s: %s", symbol, exc)
        finally:
            await exchange.close()


async def _get_df(
    exchange: ccxt.kucoinfutures, symbol: str
) -> Optional[pd.DataFrame]:
    """
    Return OHLCV DataFrame. Use cached version + incremental top-up
    if we already have history for this symbol.
    """
    tf_ms = exchange.parse_timeframe(settings.OHLCV_TIMEFRAME) * 1000

    if symbol in _df_cache:
        old_df = _df_cache[symbol]
        last_ts = old_df.index[-1]
        since = int(last_ts.timestamp() * 1000) + tf_ms  # fetch from next candle

        try:
            new_raw = await exchange.fetch_ohlcv(
                symbol,
                timeframe=settings.OHLCV_TIMEFRAME,
                since=since,
                limit=settings.OHLCV_LIMIT,
            )
        except Exception:
            return old_df  # fallback to stale

        if new_raw:
            new_df = _raw_to_df(new_raw)
            combined = pd.concat([old_df, new_df])
            combined = combined[~combined.index.duplicated(keep="last")]
            combined = combined.sort_index()
            # Keep rolling window
            combined = combined.tail(settings.OHLCV_HISTORY_CANDLES)
            _df_cache[symbol] = combined
            return combined

        return old_df

    else:
        df = await fetch_ohlcv_paginated(exchange, symbol)
        if len(df) >= settings.MIN_CANDLES_REQUIRED:
            _df_cache[symbol] = df
        return df


def _raw_to_df(raw: list) -> pd.DataFrame:
    import pandas as pd
    cols = ["timestamp", "open", "high", "low", "close", "volume"]
    df = pd.DataFrame(raw, columns=cols)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df = df.set_index("timestamp").astype(float)
    return df
