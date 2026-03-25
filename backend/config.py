"""
Application configuration — all settings via env vars (12-factor).
"""
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────────────────────────
    APP_ENV: str = "production"
    LOG_LEVEL: str = "INFO"
    PORT: int = 8080

    # ── KuCoin / CCXT ────────────────────────────────────────────────────────
    EXCHANGE_ID: str = "kucoinfutures"
    OHLCV_TIMEFRAME: str = "1h"
    OHLCV_LIMIT: int = 300          # candles per fetch
    OHLCV_HISTORY_CANDLES: int = 500  # total history for indicators

    # ── Strategy ─────────────────────────────────────────────────────────────
    EMA_FAST: int = 20
    EMA_SLOW: int = 50
    RSI_PERIOD: int = 14
    ATR_PERIOD: int = 14
    RSI_OVERBOUGHT: float = 65.0
    RSI_OVERSOLD: float = 35.0
    DEFAULT_LEVERAGE: float = 5.0
    TP_ATR_MULT: float = 2.5        # take-profit = entry ± ATR * mult
    SL_ATR_MULT: float = 1.5        # stop-loss   = entry ∓ ATR * mult
    TRAIL_ATR_MULT: float = 1.2     # trailing stop

    # ── Backtest ─────────────────────────────────────────────────────────────
    MAKER_FEE: float = 0.0002       # 0.02 %
    TAKER_FEE: float = 0.0006       # 0.06 %
    INITIAL_CAPITAL: float = 10_000.0

    # ── Scheduler ────────────────────────────────────────────────────────────
    SCAN_INTERVAL_SECONDS: int = 60
    MAX_CONCURRENT_SYMBOLS: int = 10  # parallel workers
    MAX_SYMBOLS: int = 80           # cap to avoid hammering API

    # ── Cache / Redis ─────────────────────────────────────────────────────────
    REDIS_URL: Optional[str] = None  # e.g. redis://localhost:6379/0
    CACHE_TTL_SECONDS: int = 55

    # ── Ranking ──────────────────────────────────────────────────────────────
    TOP_N: int = 20
    MIN_CANDLES_REQUIRED: int = 100

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
