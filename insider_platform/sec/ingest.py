from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from insider_platform.config import Config
from insider_platform.models import EventKey
from insider_platform.sec.edgar import fetch_filing_metadata, fetch_form4_xml
from insider_platform.sec.parser import parse_form4_xml
from insider_platform.util.normalization import build_owner_identity
from insider_platform.util.time import utcnow_iso


def _debug(msg: str) -> None:
    print(f"[ingest] {msg}")


@dataclass(frozen=True)
class FetchResult:
    accession_number: str
    issuer_cik: str | None
    filing_date: str | None
    form_type: str | None
    source_url: str | None
    fetched_at: str


@dataclass(frozen=True)
class IngestResult:
    issuer_cik: str
    ticker: str | None
    accession_number: str
    form_type: str | None
    filing_date: str | None
    source_url: str | None
    event_keys: List[EventKey]


def fetch_accession_document(
    conn: sqlite3.Connection,
    cfg: Config,
    accession_number: str,
    *,
    issuer_cik_hint: str | None = None,
    filing_date_hint: str | None = None,
    form_type_hint: str | None = None,
    force: bool = False,
) -> FetchResult:
    """Fetch the Form 4 ownershipDocument and store it in filing_documents.

    This is the *API-bound* part of ingestion. Parsing is done in a separate job so
    an API worker can be scaled independently from compute workers.

    Idempotent: by default, does nothing if the accession already exists in filing_documents.
    """
    acc = str(accession_number).strip()
    if not acc:
        raise RuntimeError("accession_number is blank")

    if not force:
        existing = conn.execute(
            "SELECT accession_number, issuer_cik, filing_date, form_type, source_url, fetched_at FROM filing_documents WHERE accession_number=?",
            (acc,),
        ).fetchone()
        if existing is not None and existing.get("fetched_at"):
            return FetchResult(
                accession_number=acc,
                issuer_cik=existing["issuer_cik"],
                filing_date=existing["filing_date"],
                form_type=existing["form_type"],
                source_url=existing["source_url"],
                fetched_at=existing["fetched_at"],
            )

    _debug(f"Fetching accession docs: {acc} issuer_cik_hint={issuer_cik_hint}")

    issuer_cik: str | None = None
    filing_date: str | None = filing_date_hint
    form_type: str | None = form_type_hint

    # If we don't have filing_date/form_type, fetch metadata (submissions JSON). This is an extra SEC request,
    # so we avoid it when backfill discovery already provided the metadata.
    if filing_date is None or form_type is None or issuer_cik_hint is None:
        meta = fetch_filing_metadata(
            acc,
            user_agent=cfg.SEC_USER_AGENT,
            issuer_cik_hint=issuer_cik_hint,
            min_interval_seconds=getattr(cfg, "SEC_MIN_INTERVAL_SECONDS", None),
        )
        issuer_cik = (meta.issuer_cik or issuer_cik_hint or "").zfill(10) if (meta.issuer_cik or issuer_cik_hint) else None
        filing_date = filing_date or meta.filing_date
        form_type = form_type or meta.form_type
    else:
        issuer_cik = issuer_cik_hint.zfill(10) if issuer_cik_hint else None

    xml_text, source_url = fetch_form4_xml(
        acc,
        user_agent=cfg.SEC_USER_AGENT,
        issuer_cik_hint=issuer_cik_hint,
        min_interval_seconds=getattr(cfg, "SEC_MIN_INTERVAL_SECONDS", None),
    )

    fetched_at = utcnow_iso()

    conn.execute(
        """
        INSERT INTO filing_documents (accession_number, issuer_cik, filing_date, form_type, source_url, xml_text, fetched_at)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(accession_number) DO UPDATE SET
            issuer_cik=COALESCE(excluded.issuer_cik, filing_documents.issuer_cik),
            filing_date=COALESCE(excluded.filing_date, filing_documents.filing_date),
            form_type=COALESCE(excluded.form_type, filing_documents.form_type),
            source_url=COALESCE(excluded.source_url, filing_documents.source_url),
            xml_text=excluded.xml_text,
            fetched_at=excluded.fetched_at
        """,
        (acc, issuer_cik, filing_date, form_type, source_url, xml_text, fetched_at),
    )

    # If this accession is part of a backfill run, mark it fetched.
    if issuer_cik:
        conn.execute(
            """
            UPDATE backfill_queue
            SET status='fetched', updated_at=?, last_error=NULL
            WHERE issuer_cik=? AND accession_number=? AND status IN ('pending','queued','error')
            """,
            (fetched_at, issuer_cik, acc),
        )

    return FetchResult(
        accession_number=acc,
        issuer_cik=issuer_cik,
        filing_date=filing_date,
        form_type=form_type,
        source_url=source_url,
        fetched_at=fetched_at,
    )


def parse_accession_document(
    conn: sqlite3.Connection,
    cfg: Config,
    accession_number: str,
) -> IngestResult:
    """Parse a previously-fetched filing_documents row and persist to filings/form4_rows_raw.

    This is CPU/DB bound, and safe to run on a compute worker with **no network access**.
    """
    acc = str(accession_number).strip()
    if not acc:
        raise RuntimeError("accession_number is blank")

    doc = conn.execute(
        """
        SELECT accession_number, issuer_cik, filing_date, form_type, source_url, xml_text
        FROM filing_documents
        WHERE accession_number=?
        """,
        (acc,),
    ).fetchone()

    if doc is not None:
        doc = dict(doc)
    if doc is None or not doc.get("xml_text"):
        raise RuntimeError(f"No filing_documents row for accession_number={acc}. Fetch it first.")

    parsed = parse_form4_xml(str(doc["xml_text"]))

    issuer_cik = (parsed.issuer_cik or doc["issuer_cik"] or "").zfill(10)
    if not issuer_cik:
        raise RuntimeError(f"Could not resolve issuer_cik for accession={acc}")

    ticker = (parsed.issuer_trading_symbol or "").strip() or None
    issuer_name = parsed.issuer_name

    filing_date = str(doc["filing_date"]) if doc.get("filing_date") else None
    form_type = str(doc["form_type"] or parsed.document_type or "4") if doc is not None else (parsed.document_type or "4")
    source_url = str(doc["source_url"]) if doc.get("source_url") else None

    now = utcnow_iso()

    # issuer_master upsert
    # IMPORTANT: last_filing_date should always represent the most recent filing we have seen.
    # filing_date is ISO (YYYY-MM-DD), so lexical comparison works.
    conn.execute(
        """
        INSERT INTO issuer_master (issuer_cik, current_ticker, ticker_updated_at, issuer_name, last_filing_date)
        VALUES (?,?,?,?,?)
        ON CONFLICT(issuer_cik) DO UPDATE SET
            -- Only overwrite the ticker when we actually have one
            current_ticker=COALESCE(excluded.current_ticker, issuer_master.current_ticker),
            ticker_updated_at=CASE
                WHEN excluded.current_ticker IS NOT NULL AND excluded.current_ticker <> '' THEN excluded.ticker_updated_at
                ELSE issuer_master.ticker_updated_at
            END,
            issuer_name=COALESCE(excluded.issuer_name, issuer_master.issuer_name),

            -- Keep the MAX of existing vs new (handling NULLs)
            last_filing_date=CASE
                WHEN issuer_master.last_filing_date IS NULL THEN excluded.last_filing_date
                WHEN excluded.last_filing_date IS NULL THEN issuer_master.last_filing_date
                WHEN excluded.last_filing_date > issuer_master.last_filing_date THEN excluded.last_filing_date
                ELSE issuer_master.last_filing_date
            END
        """,
        (issuer_cik, ticker, now, issuer_name, filing_date),
    )

    # filings upsert
    conn.execute(
        """
        INSERT INTO filings (accession_number, issuer_cik, ticker_reported, form_type, filing_date, source_url, parse_version, ingested_at)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(accession_number) DO UPDATE SET
            issuer_cik=excluded.issuer_cik,
            ticker_reported=excluded.ticker_reported,
            form_type=excluded.form_type,
            filing_date=excluded.filing_date,
            source_url=excluded.source_url,
            parse_version=excluded.parse_version,
            ingested_at=excluded.ingested_at
        """,
        (acc, issuer_cik, ticker, form_type, filing_date or now[:10], source_url, cfg.CURRENT_PARSE_VERSION, now),
    )

    # delete existing raw rows (idempotent parse)
    conn.execute("DELETE FROM form4_rows_raw WHERE accession_number=?", (acc,))

    # Insert raw rows: one per reporting owner per transaction (spec-driven)
    event_keys: List[EventKey] = []

    if not parsed.reporting_owners:
        # Rare: missing reportingOwner in XML - create a placeholder owner
        oid = build_owner_identity(None, None)
        parsed_owners = [
            {
                "identity": oid,
                "is_director": None,
                "is_officer": None,
                "is_ten_percent_owner": None,
                "officer_title": None,
            }
        ]
    else:
        parsed_owners = []
        for ro in parsed.reporting_owners:
            oid = build_owner_identity(ro.owner_cik, ro.owner_name)
            parsed_owners.append(
                {
                    "identity": oid,
                    "is_director": ro.is_director,
                    "is_officer": ro.is_officer,
                    "is_ten_percent_owner": ro.is_ten_percent_owner,
                    "officer_title": ro.officer_title,
                }
            )

    for ro in parsed_owners:
        oid = ro["identity"]
        event_keys.append(EventKey(issuer_cik=issuer_cik, owner_key=oid.owner_key, accession_number=acc))

        for tx in parsed.transactions:
            warnings: List[str] = []
            if not tx.transaction_date:
                warnings.append("missing_transaction_date")

            shares_raw = tx.shares
            shares_abs = abs(shares_raw) if isinstance(shares_raw, (int, float)) else None

            price_raw = tx.price
            price = None
            if price_raw is not None:
                try:
                    price = float(str(price_raw).replace(",", "").strip())
                except Exception:
                    warnings.append("bad_price")

            raw_payload: Dict[str, Any] = dict(tx.raw_payload)
            raw_payload["reporting_owner"] = {
                "owner_key": oid.owner_key,
                "owner_cik": oid.owner_cik,
                "owner_name_raw": oid.owner_name_raw,
                "owner_name_normalized": oid.owner_name_normalized,
                "is_director": ro["is_director"],
                "is_officer": ro["is_officer"],
                "is_ten_percent_owner": ro["is_ten_percent_owner"],
                "officer_title": ro["officer_title"],
                "is_entity_guess": oid.is_entity_name_guess,
            }

            conn.execute(
                """
                INSERT INTO form4_rows_raw (
                    accession_number, issuer_cik,
                    owner_key, owner_cik, owner_name_raw, owner_name_normalized, owner_name_hash,
                    is_derivative, transaction_code, transaction_date,
                    shares_raw, shares_abs, price_raw, price, shares_owned_following,
                    parser_warnings_json, raw_payload_json
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    acc,
                    issuer_cik,
                    oid.owner_key,
                    oid.owner_cik,
                    oid.owner_name_raw,
                    oid.owner_name_normalized,
                    oid.owner_name_hash,
                    1 if tx.is_derivative else 0,
                    tx.transaction_code,
                    tx.transaction_date,
                    shares_raw,
                    shares_abs,
                    price_raw,
                    price,
                    tx.shares_owned_following,
                    json.dumps(warnings) if warnings else None,
                    json.dumps(raw_payload, ensure_ascii=False),
                ),
            )

    # backfill bookkeeping
    conn.execute(
        """
        UPDATE backfill_queue
        SET status='parsed', updated_at=?, last_error=NULL
        WHERE issuer_cik=? AND accession_number=?
        """,
        (now, issuer_cik, acc),
    )

    _debug(
        f"Parsed accession={acc} issuer={issuer_cik} owners={len(parsed_owners)} txs={len(parsed.transactions)}"
    )

    return IngestResult(
        issuer_cik=issuer_cik,
        ticker=ticker,
        accession_number=acc,
        form_type=form_type,
        filing_date=filing_date,
        source_url=source_url,
        event_keys=event_keys,
    )


def ingest_accession(
    conn: sqlite3.Connection,
    cfg: Config,
    accession_number: str,
    issuer_cik_hint: str | None = None,
) -> IngestResult:
    """Backward-compatible helper: fetch + parse in one call."""
    fetch_accession_document(conn, cfg, accession_number, issuer_cik_hint=issuer_cik_hint)
    return parse_accession_document(conn, cfg, accession_number)
