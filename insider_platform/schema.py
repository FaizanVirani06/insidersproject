"""Database schema for the Insider Trading Analysis Platform.

The original project started on SQLite. We now support Postgres as well.

We intentionally keep timestamps as ISO-8601 TEXT (UTC, with 'Z') for portability and to
avoid timezone surprises across engines. ISO strings sort lexicographically in time order,
so comparisons like `run_after <= now_iso` behave correctly.

NOTE: The Postgres schema is generated from the SQLite schema with a small set of
transformations (types + autoincrement).
"""

from __future__ import annotations

import re


SCHEMA_SQLITE = r"""
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Users / Auth
-- NOTE: This is intentionally simple (username/password + role).
-- We use JWTs for stateless auth and store only password hashes.
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','user')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT,

    -- Billing / subscription (Stripe)
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    subscription_status TEXT, -- e.g. active|trialing|past_due|canceled
    current_period_end TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    subscription_updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users (role, is_active);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users (subscription_status, is_active);

-- Feedback (customers)
CREATE TABLE IF NOT EXISTS user_feedback (
    feedback_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    page_url TEXT,
    rating INTEGER,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_user_created ON user_feedback (user_id, created_at);

-- Stripe webhook idempotency
CREATE TABLE IF NOT EXISTS stripe_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issuer_master (
    issuer_cik TEXT PRIMARY KEY,
    current_ticker TEXT,
    ticker_updated_at TEXT,
    issuer_name TEXT,
    last_filing_date TEXT
);

CREATE TABLE IF NOT EXISTS filings (
    accession_number TEXT PRIMARY KEY,
    issuer_cik TEXT NOT NULL,
    ticker_reported TEXT,
    form_type TEXT NOT NULL,
    filing_date TEXT NOT NULL,
    source_url TEXT,
    parse_version TEXT NOT NULL,
    ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_filings_issuer_date ON filings (issuer_cik, filing_date);

CREATE TABLE IF NOT EXISTS filing_documents (
    accession_number TEXT PRIMARY KEY,
    issuer_cik TEXT,
    filing_date TEXT,
    form_type TEXT,
    source_url TEXT,
    xml_text TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_filing_documents_issuer ON filing_documents (issuer_cik);

CREATE TABLE IF NOT EXISTS form4_rows_raw (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    accession_number TEXT NOT NULL,
    issuer_cik TEXT NOT NULL,
    owner_key TEXT NOT NULL,
    owner_cik TEXT,
    owner_name_raw TEXT,
    owner_name_normalized TEXT,
    owner_name_hash TEXT,
    is_derivative INTEGER NOT NULL,
    transaction_code TEXT,
    transaction_date TEXT,
    shares_raw REAL,
    shares_abs REAL,
    price_raw TEXT,
    price REAL,
    shares_owned_following REAL,
    parser_warnings_json TEXT,
    raw_payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rows_accession ON form4_rows_raw (accession_number);
CREATE INDEX IF NOT EXISTS idx_rows_eventkey ON form4_rows_raw (issuer_cik, owner_key, accession_number);
CREATE INDEX IF NOT EXISTS idx_rows_issuer_code_date ON form4_rows_raw (issuer_cik, transaction_code, transaction_date);

CREATE TABLE IF NOT EXISTS insider_events (
    issuer_cik TEXT NOT NULL,
    owner_key TEXT NOT NULL,
    accession_number TEXT NOT NULL,

    ticker TEXT,
    filing_date TEXT NOT NULL,
    event_trade_date TEXT,

    owner_cik TEXT,
    owner_name_display TEXT,
    owner_title TEXT,
    is_officer INTEGER,
    is_director INTEGER,
    is_ten_percent_owner INTEGER,

    -- Buy (P)
    has_buy INTEGER NOT NULL DEFAULT 0,
    buy_trade_date TEXT,
    buy_last_tx_date TEXT,
    buy_shares_total REAL,
    buy_dollars_total REAL,
    buy_vwap_price REAL,
    buy_priced_shares_total REAL,
    buy_unpriced_shares_total REAL,
    buy_vwap_is_partial INTEGER,
    buy_shares_owned_following REAL,
    buy_pct_holdings_change REAL,
    buy_pct_change_missing_reason TEXT,

    -- Sell (S)
    has_sell INTEGER NOT NULL DEFAULT 0,
    sell_trade_date TEXT,
    sell_last_tx_date TEXT,
    sell_shares_total REAL,
    sell_dollars_total REAL,
    sell_vwap_price REAL,
    sell_priced_shares_total REAL,
    sell_unpriced_shares_total REAL,
    sell_vwap_is_partial INTEGER,
    sell_shares_owned_following REAL,
    sell_pct_holdings_change REAL,
    sell_pct_change_missing_reason TEXT,

    -- Summaries
    non_open_market_row_count INTEGER NOT NULL DEFAULT 0,
    derivative_row_count INTEGER NOT NULL DEFAULT 0,

    -- Trend context (event-level)
    trend_anchor_trading_date TEXT,
    trend_close REAL,
    trend_ret_20d REAL,
    trend_ret_60d REAL,
    trend_dist_52w_high REAL,
    trend_dist_52w_low REAL,
    trend_above_sma_50 INTEGER,
    trend_above_sma_200 INTEGER,
    trend_missing_reason TEXT,

    -- Cluster
    cluster_flag_buy INTEGER,
    cluster_id_buy TEXT,
    cluster_flag_sell INTEGER,
    cluster_id_sell TEXT,

    -- Market cap snapshot (denormalized)
    market_cap BIGINT,
    market_cap_bucket TEXT,
    market_cap_updated_at TEXT,

    -- AI snapshot (denormalized)
    ai_buy_rating REAL,
    ai_sell_rating REAL,
    ai_confidence REAL,
    ai_model_id TEXT,
    ai_prompt_version TEXT,
    ai_generated_at TEXT,

    -- Versions and timestamps
    parse_version TEXT NOT NULL,
    event_computed_at TEXT NOT NULL,
    trend_computed_at TEXT,
    outcomes_computed_at TEXT,
    stats_computed_at TEXT,
    cluster_computed_at TEXT,
    ai_computed_at TEXT,

    PRIMARY KEY (issuer_cik, owner_key, accession_number)
);
CREATE INDEX IF NOT EXISTS idx_events_ticker_date ON insider_events (ticker, filing_date);
CREATE INDEX IF NOT EXISTS idx_events_issuer_owner_date ON insider_events (issuer_cik, owner_key, filing_date);
CREATE INDEX IF NOT EXISTS idx_events_ticker_trade ON insider_events (ticker, event_trade_date);
CREATE INDEX IF NOT EXISTS idx_events_cluster_buy ON insider_events (ticker, cluster_flag_buy);
CREATE INDEX IF NOT EXISTS idx_events_cluster_sell ON insider_events (ticker, cluster_flag_sell);

CREATE TABLE IF NOT EXISTS event_outcomes (
    issuer_cik TEXT NOT NULL,
    owner_key TEXT NOT NULL,
    accession_number TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy','sell')),

    trade_date TEXT,
    anchor_trading_date TEXT,
    p0 REAL,

    future_date_60d TEXT,
    future_price_60d REAL,
    return_60d REAL,
    missing_reason_60d TEXT,

    bench_symbol TEXT,
    bench_return_60d REAL,
    bench_missing_reason_60d TEXT,
    excess_return_60d REAL,

    future_date_180d TEXT,
    future_price_180d REAL,
    return_180d REAL,
    missing_reason_180d TEXT,

    bench_return_180d REAL,
    bench_missing_reason_180d TEXT,
    excess_return_180d REAL,

    outcomes_version TEXT NOT NULL,
    computed_at TEXT NOT NULL,

    PRIMARY KEY (issuer_cik, owner_key, accession_number, side)
);
CREATE INDEX IF NOT EXISTS idx_outcomes_issuer_owner_side ON event_outcomes (issuer_cik, owner_key, side);

CREATE TABLE IF NOT EXISTS issuer_prices_daily (
    issuer_cik TEXT NOT NULL,
    date TEXT NOT NULL,
    adj_close REAL NOT NULL,
    source_ticker TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (issuer_cik, date)
);
CREATE INDEX IF NOT EXISTS idx_prices_issuer_date ON issuer_prices_daily (issuer_cik, date);
CREATE TABLE IF NOT EXISTS benchmark_prices_daily (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    adj_close REAL NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (symbol, date)
);
CREATE INDEX IF NOT EXISTS idx_benchmark_prices_symbol_date ON benchmark_prices_daily (symbol, date);


CREATE TABLE IF NOT EXISTS clusters (
    cluster_id TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,
    issuer_cik TEXT,
    side TEXT NOT NULL CHECK (side IN ('buy','sell')),
    window_start_date TEXT NOT NULL,
    window_end_date TEXT NOT NULL,
    unique_insiders INTEGER NOT NULL,
    total_dollars REAL NOT NULL,
    execs_involved INTEGER NOT NULL,
    max_pct_holdings_change REAL,
    cluster_version TEXT NOT NULL,
    computed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clusters_ticker_side_window ON clusters (ticker, side, window_start_date, window_end_date);

CREATE TABLE IF NOT EXISTS cluster_members (
    cluster_id TEXT NOT NULL,
    issuer_cik TEXT NOT NULL,
    owner_key TEXT NOT NULL,
    accession_number TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy','sell')),
    trade_date TEXT NOT NULL,
    dollars_contributed REAL,
    pct_holdings_change REAL,
    PRIMARY KEY (cluster_id, issuer_cik, owner_key, accession_number, side)
);
CREATE INDEX IF NOT EXISTS idx_cluster_members_event ON cluster_members (issuer_cik, owner_key, accession_number, side);

CREATE TABLE IF NOT EXISTS insider_issuer_stats (
    issuer_cik TEXT NOT NULL,
    owner_key TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy','sell')),

    eligible_n_60d INTEGER NOT NULL,
    win_rate_60d REAL,
    avg_return_60d REAL,

    eligible_n_180d INTEGER NOT NULL,
    win_rate_180d REAL,
    avg_return_180d REAL,

    stats_version TEXT NOT NULL,
    computed_at TEXT NOT NULL,

    PRIMARY KEY (issuer_cik, owner_key, side)
);
CREATE INDEX IF NOT EXISTS idx_stats_issuer_owner ON insider_issuer_stats (issuer_cik, owner_key);

CREATE TABLE IF NOT EXISTS market_cap_cache (
    ticker TEXT PRIMARY KEY,
    market_cap BIGINT,
    market_cap_bucket TEXT,
    market_cap_source TEXT NOT NULL DEFAULT 'eodhd',
    market_cap_updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_outputs (
    ai_output_id INTEGER PRIMARY KEY AUTOINCREMENT,
    issuer_cik TEXT NOT NULL,
    owner_key TEXT NOT NULL,
    accession_number TEXT NOT NULL,

    model_id TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    input_schema_version TEXT NOT NULL,
    output_schema_version TEXT NOT NULL,
    inputs_hash TEXT NOT NULL,

    buy_rating REAL,
    sell_rating REAL,
    confidence REAL,

    input_json TEXT NOT NULL,
    output_json TEXT NOT NULL,
    generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_event ON ai_outputs (issuer_cik, owner_key, accession_number);
CREATE INDEX IF NOT EXISTS idx_ai_inputs_hash ON ai_outputs (inputs_hash);

CREATE TABLE IF NOT EXISTS backfill_queue (
    issuer_cik TEXT NOT NULL,
    accession_number TEXT NOT NULL,
    filing_date TEXT,
    form_type TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending','queued','fetched','parsed','error')),
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (issuer_cik, accession_number)
);
CREATE INDEX IF NOT EXISTS idx_backfill_status ON backfill_queue (status, issuer_cik, filing_date);

CREATE TABLE IF NOT EXISTS jobs (
    job_id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','running','success','error')),
    priority INTEGER NOT NULL DEFAULT 100,
    dedupe_key TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    run_after TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON jobs (status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_run_after ON jobs (run_after);

CREATE TABLE IF NOT EXISTS data_issues (
    issue_id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
    issuer_cik TEXT,
    ticker TEXT,
    accession_number TEXT,
    details_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT
);

-- EODHD fundamentals cache (store raw JSON + extracted highlights for AI/context)
CREATE TABLE IF NOT EXISTS issuer_fundamentals_cache (
    ticker TEXT PRIMARY KEY,
    eodhd_symbol TEXT,
    market_cap BIGINT,
    pe_ratio REAL,
    eps REAL,
    shares_outstanding REAL,
    fundamentals_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fundamentals_updated_at ON issuer_fundamentals_cache (updated_at);

-- EODHD news cache (store recent headlines / sentiment)
CREATE TABLE IF NOT EXISTS issuer_news (
    ticker TEXT NOT NULL,
    published_at TEXT,
    title TEXT,
    source TEXT,
    url TEXT NOT NULL,
    sentiment REAL,
    summary TEXT,
    news_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (ticker, url)
);
CREATE INDEX IF NOT EXISTS idx_news_ticker_published ON issuer_news (ticker, published_at);
"""


def _sqlite_to_postgres(ddl: str) -> str:
    # Remove SQLite pragmas
    lines: list[str] = []
    for line in ddl.splitlines():
        if line.strip().upper().startswith("PRAGMA "):
            continue
        lines.append(line)
    out = "\n".join(lines)

    # Types
    out = re.sub(r"\bREAL\b", "DOUBLE PRECISION", out)

    # AUTOINCREMENT primary keys
    out = re.sub(
        r"INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT",
        "BIGSERIAL PRIMARY KEY",
        out,
        flags=re.IGNORECASE,
    )
    out = re.sub(r"\bAUTOINCREMENT\b", "", out, flags=re.IGNORECASE)

    return out


SCHEMA_POSTGRES = _sqlite_to_postgres(SCHEMA_SQLITE)


def get_schema_sql(dialect: str) -> str:
    d = (dialect or "").lower()
    if d.startswith("post"):
        return SCHEMA_POSTGRES
    return SCHEMA_SQLITE
