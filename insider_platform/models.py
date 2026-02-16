from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EventKey:
    issuer_cik: str
    owner_key: str
    accession_number: str


@dataclass(frozen=True)
class OwnerIssuerKey:
    issuer_cik: str
    owner_key: str
