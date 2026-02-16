from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from insider_platform.util.hashing import sha256_hex


_SUFFIXES = {
    "jr",
    "sr",
    "ii",
    "iii",
    "iv",
    "v",
    "md",
    "phd",
    "cpa",
    "esq",
}

_ENTITY_TOKENS = {
    "llc",
    "inc",
    "ltd",
    "lp",
    "llp",
    "plc",
    "corp",
    "corporation",
    "company",
    "co",
    "partners",
    "holdings",
    "trust",
    "foundation",
    "capital",
    "management",
}


@dataclass(frozen=True)
class OwnerIdentity:
    owner_key: str
    owner_cik: str | None
    owner_name_raw: str | None
    owner_name_normalized: str | None
    owner_name_hash: str | None
    is_entity_name_guess: bool


def normalize_cik(owner_cik: str | None) -> str | None:
    """Normalize an owner CIK: digits only, left-pad to 10.

    Returns None if input is blank or contains no digits.
    """
    if owner_cik is None:
        return None
    s = str(owner_cik).strip()
    if not s:
        return None
    digits = "".join(ch for ch in s if ch.isdigit())
    if not digits:
        return None
    return digits.zfill(10)


def _basic_name_norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = s.replace("\u00a0", " ")
    s = s.lower().strip()

    # Replace any non-alphanumeric runs with spaces.
    # This also turns hyphens/punctuation into word boundaries.
    s = re.sub(r"[^a-z0-9]+", " ", s)

    # Collapse whitespace
    s = " ".join(s.split())
    return s


def normalize_owner_name(owner_name_raw: str | None) -> tuple[str | None, bool]:
    """Normalize an owner name for hashing.

    Returns (normalized_name, is_entity_guess).

    IMPORTANT: This is conservative normalization - it avoids fuzzy matching.
    """
    if owner_name_raw is None:
        return None, False

    raw = str(owner_name_raw).strip()
    if not raw:
        return None, False

    # Comma-based "LAST, FIRST M" handling: only if comma exists in raw.
    if "," in raw:
        left, right = raw.split(",", 1)
        left_n = _basic_name_norm(left)
        right_n = _basic_name_norm(right)
        if left_n and right_n:
            s = f"{right_n} {left_n}".strip()
        else:
            s = _basic_name_norm(raw)
    else:
        s = _basic_name_norm(raw)

    if not s:
        return None, False

    tokens = s.split()

    # Suffix stripping (only from end)
    while tokens and tokens[-1] in _SUFFIXES:
        tokens.pop()

    s2 = " ".join(tokens).strip()

    is_entity_guess = any(tok in _ENTITY_TOKENS for tok in tokens)
    return s2 if s2 else None, is_entity_guess


def build_owner_identity(owner_cik: str | None, owner_name_raw: str | None) -> OwnerIdentity:
    """Build the canonical owner identity used for event keys."""
    cik = normalize_cik(owner_cik)
    if cik:
        # CIK wins; still keep name fields for audit/debug
        norm_name, is_entity = normalize_owner_name(owner_name_raw)
        name_hash = sha256_hex(norm_name) if norm_name else None
        return OwnerIdentity(
            owner_key=cik,
            owner_cik=cik,
            owner_name_raw=owner_name_raw,
            owner_name_normalized=norm_name,
            owner_name_hash=name_hash,
            is_entity_name_guess=is_entity,
        )

    norm_name, is_entity = normalize_owner_name(owner_name_raw)
    if norm_name:
        name_hash = sha256_hex(norm_name)
        return OwnerIdentity(
            owner_key=f"namehash:{name_hash}",
            owner_cik=None,
            owner_name_raw=owner_name_raw,
            owner_name_normalized=norm_name,
            owner_name_hash=name_hash,
            is_entity_name_guess=is_entity,
        )

    # Extremely rare: missing CIK and missing name
    fallback_hash = sha256_hex("unknown_owner")
    return OwnerIdentity(
        owner_key=f"unknown:{fallback_hash}",
        owner_cik=None,
        owner_name_raw=owner_name_raw,
        owner_name_normalized=None,
        owner_name_hash=None,
        is_entity_name_guess=False,
    )
