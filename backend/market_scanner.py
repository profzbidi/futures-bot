"""
market_scanner.py
─────────────────
Loads all USDT-quoted perpetual futures from KuCoin Futures (public API only).
Caches the market list in memory and refreshes every 30 min.
"""
import asyncio
import logging
import time
from typing import List, Dict, Optional

import ccxt.async_support as ccxt

from config import settings

logger = logging.getLogger(__name__)

_MARKETS_CACHE: List[str] = []
_CACHE_TS: float = 0.0
_CACHE_TTL = 1800  # 30 min


async def _build_exchange() -> ccxt.kucoinfutures:
    exchange = ccxt.kucoinfutures(
        {
            "enableRateLimit": True,
            "options": {"defaultType": "swap"},
        }
    )
    return exchange


async def load_markets(force: bool = False) -> List[str]:
    """Return list of USDT-perpetual symbols, e.g. ['BTC/USDT:USDT', ...]."""
    global _MARKETS_CACHE, _CACHE_TS

    if not force and _MARKETS_CACHE and (time.time() - _CACHE_TS) < _CACHE_TTL:
        return _MARKETS_CACHE

    exchange = await _build_exchange()
    try:
        logger.info("Loading markets from KuCoin Futures …")
        markets: Dict = await exchange.load_markets()

        symbols = [
            sym
            for sym, mkt in markets.items()
            if mkt.get("quote") == "USDT"
            and mkt.get("type") == "swap"
            and mkt.get("active", True)
            and mkt.get("linear", True)
        ]

        # Sort by volume proxy (settleCurrency keeps USDT linear only)
        symbols.sort()

        # Hard cap to avoid quota exhaustion
        symbols = symbols[: settings.MAX_SYMBOLS]

        _MARKETS_CACHE = symbols
        _CACHE_TS = time.time()
        logger.info("Loaded %d USDT perpetual markets.", len(symbols))
        return symbols

    except Exception as exc:
        logger.error("Failed to load markets: %s", exc)
        return _MARKETS_CACHE  # return stale on error
    finally:
        await exchange.close()


def get_cached_markets() -> List[str]:
    return _MARKETS_CACHE
