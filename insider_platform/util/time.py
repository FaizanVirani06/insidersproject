from __future__ import annotations

from datetime import datetime, timezone


def utcnow_iso() -> str:
    """Current UTC time as ISO-8601 string with Z."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def iso_date(dt: datetime) -> str:
    return dt.date().isoformat()
