from __future__ import annotations

import re
import time
import threading
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import requests


@dataclass(frozen=True)
class FilingMetadata:
    issuer_cik: str
    accession_number: str
    filing_date: str | None
    form_type: str | None
    source_url: str | None


def _debug(msg: str) -> None:
    print(f"[sec] {msg}")


# Per-process polite throttling for SEC endpoints.
_SEC_LAST_REQUEST_MONO: float = 0.0
_SEC_LOCK = threading.Lock()


def _throttle(min_interval_seconds: float | None) -> None:
    if not min_interval_seconds or min_interval_seconds <= 0:
        return
    global _SEC_LAST_REQUEST_MONO
    with _SEC_LOCK:
        now = time.monotonic()
        dt = now - _SEC_LAST_REQUEST_MONO
        if dt < min_interval_seconds:
            time.sleep(min_interval_seconds - dt)
        _SEC_LAST_REQUEST_MONO = time.monotonic()


def _normalize_accession(accession_number: str) -> str:
    return str(accession_number or "").strip()


def _cik_from_accession(accession_number: str) -> str:
    # Accession typically starts with 10-digit CIK (may include leading zeros)
    part = str(accession_number or "").split("-")[0]
    digits = "".join(ch for ch in part if ch.isdigit())
    return digits.zfill(10)


def _cik_path_component(cik10: str) -> str:
    # EDGAR path uses integer CIK without leading zeros
    return str(int(cik10))


def _accession_nodash(accession_number: str) -> str:
    return str(accession_number or "").replace("-", "").strip()


def _get_json(url: str, user_agent: str, min_interval_seconds: float | None = None) -> Dict[str, Any]:
    _debug(f"GET {url}")
    _throttle(min_interval_seconds)
    r = requests.get(url, headers={"User-Agent": user_agent}, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"SEC request failed {r.status_code}: {r.text}")
    return r.json()


def _get_text(url: str, user_agent: str, min_interval_seconds: float | None = None) -> str:
    _debug(f"GET {url}")
    _throttle(min_interval_seconds)
    r = requests.get(url, headers={"User-Agent": user_agent}, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"SEC request failed {r.status_code}: {r.text}")
    return r.text


def _scan_recent_block(recent: Dict[str, Any], acc: str) -> Tuple[str | None, str | None]:
    accs = recent.get("accessionNumber") or []
    forms = recent.get("form") or []
    dates = recent.get("filingDate") or []
    for i, a in enumerate(accs):
        if str(a).strip() == acc:
            filing_date = dates[i] if i < len(dates) else None
            form_type = forms[i] if i < len(forms) else None
            return filing_date, form_type
    return None, None


def fetch_filing_metadata(
    accession_number: str,
    user_agent: str,
    issuer_cik_hint: str | None = None,
    min_interval_seconds: float | None = None,
) -> FilingMetadata:
    """Fetch filing_date/form_type for an accession from the issuer submissions JSON.

    Note: For older filings, the SEC splits the index across multiple files under `filings.files`.
    We scan those lazily if the accession isn't present in the `recent` block.
    """
    acc = _normalize_accession(accession_number)
    issuer_cik = ("".join(ch for ch in str(issuer_cik_hint) if ch.isdigit()).zfill(10) if issuer_cik_hint else _cik_from_accession(acc))

    submissions_url = f"https://data.sec.gov/submissions/CIK{issuer_cik}.json"
    data = _get_json(submissions_url, user_agent=user_agent, min_interval_seconds=min_interval_seconds)

    filing_date: str | None = None
    form_type: str | None = None

    recent = (data.get("filings") or {}).get("recent") or {}
    filing_date, form_type = _scan_recent_block(recent, acc)

    # Older filings: scan additional index files (if any)
    if filing_date is None and form_type is None:
        files = (data.get("filings") or {}).get("files") or []
        for f in files:
            name = str((f or {}).get("name") or "").strip()
            if not name:
                continue
            try:
                url = f"https://data.sec.gov/submissions/{name}"
                data2 = _get_json(url, user_agent=user_agent, min_interval_seconds=min_interval_seconds)
                recent2 = (data2.get("filings") or {}).get("recent") or {}
                filing_date, form_type = _scan_recent_block(recent2, acc)
                if filing_date is not None or form_type is not None:
                    break
            except Exception:
                # Skip bad file blocks to avoid breaking ingestion
                continue

    return FilingMetadata(
        issuer_cik=issuer_cik,
        accession_number=acc,
        filing_date=filing_date,
        form_type=form_type,
        source_url=None,
    )


def fetch_form4_xml(
    accession_number: str,
    user_agent: str,
    issuer_cik_hint: str | None = None,
    min_interval_seconds: float | None = None,
) -> Tuple[str, str]:
    """Fetch the Form 4 ownershipDocument XML for an accession.

    Many Form 4 accessions include a dedicated .xml file, but some embed the ownershipDocument
    inside a .txt/.htm/.html file. We:
      1) Try with issuer_cik_hint (if provided), else the accession prefix CIK.
      2) If that fails, try the other CIK as fallback.
      3) Search candidates and extract the <ownershipDocument> fragment.
    """
    acc = _normalize_accession(accession_number)

    # Try both CIKs (hint first, then accession prefix) to reduce false negatives.
    ciks: List[str] = []
    if issuer_cik_hint:
        digits = "".join(ch for ch in str(issuer_cik_hint) if ch.isdigit())
        if digits:
            ciks.append(digits.zfill(10))

    prefix = _cik_from_accession(acc)
    if prefix and prefix not in ciks:
        ciks.append(prefix)

    last_err: Optional[Exception] = None
    for cik10 in ciks:
        try:
            return _fetch_form4_xml_for_cik(
                acc,
                cik10=cik10,
                user_agent=user_agent,
                min_interval_seconds=min_interval_seconds,
            )
        except Exception as e:
            last_err = e
            continue

    raise RuntimeError(f"Could not fetch ownershipDocument for accession={acc}. last_err={last_err}")


def _fetch_form4_xml_for_cik(
    acc: str,
    cik10: str,
    user_agent: str,
    min_interval_seconds: float | None = None,
) -> Tuple[str, str]:
    cik_path = _cik_path_component(cik10)
    acc_nd = _accession_nodash(acc)

    index_url = f"https://www.sec.gov/Archives/edgar/data/{cik_path}/{acc_nd}/index.json"
    idx = _get_json(index_url, user_agent=user_agent, min_interval_seconds=min_interval_seconds)

    items = (idx.get("directory") or {}).get("item") or []
    names = [str(it.get("name") or "").strip() for it in items]

    # Candidate files: allow XML or embedded docs.
    exts = (".xml", ".txt", ".htm", ".html")
    candidates = [n for n in names if n and n.lower().endswith(exts)]
    if not candidates:
        raise RuntimeError(f"No XML/TXT/HTM files found in accession directory: {index_url}")

    base_dir = f"https://www.sec.gov/Archives/edgar/data/{cik_path}/{acc_nd}/"

    # Heuristic scoring: prefer likely ownership docs.
    def score(name: str) -> int:
        n = name.lower()
        s = 0
        # Prefer XML files
        if n.endswith(".xml"):
            s += 3
        # Prefer files that look like ownership/form4
        if "ownership" in n:
            s += 4
        if "form" in n:
            s += 2
        if "4" in n:
            s += 1
        # Penalize obviously unrelated xml (xsd) if it sneaks in
        if n.endswith(".xsd"):
            s -= 5
        return -s

    candidates_sorted = sorted(candidates, key=score)

    # Extract <ownershipDocument>...</ownershipDocument> fragment if embedded.
    def extract_ownership(text: str) -> Optional[str]:
        if not isinstance(text, str):
            return None
        m_start = re.search(r"<ownershipdocument\b", text, flags=re.IGNORECASE)
        if not m_start:
            return None
        m_end = re.search(r"</ownershipdocument>", text, flags=re.IGNORECASE)
        if not m_end:
            return None
        return text[m_start.start() : m_end.end()]

    last_err: Optional[Exception] = None
    for fname in candidates_sorted:
        url = base_dir + fname
        try:
            text = _get_text(url, user_agent=user_agent, min_interval_seconds=min_interval_seconds)
            frag = extract_ownership(text)
            if frag:
                _debug(f"Selected ownershipDocument file: {fname} (cik10={cik10})")
                return frag, url
        except Exception as e:
            last_err = e
            continue

    raise RuntimeError(f"Could not locate ownershipDocument in accession directory: {index_url} last_err={last_err}")
