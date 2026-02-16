from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from xml.etree import ElementTree as ET


def _debug(msg: str) -> None:
    print(f"[parser] {msg}")


@dataclass(frozen=True)
class ReportingOwner:
    owner_cik: str | None
    owner_name: str | None
    is_director: bool | None
    is_officer: bool | None
    is_ten_percent_owner: bool | None
    officer_title: str | None


@dataclass(frozen=True)
class TransactionRow:
    is_derivative: bool
    transaction_code: str | None
    transaction_date: str | None
    shares: float | None
    price: str | None
    shares_owned_following: float | None
    raw_payload: Dict[str, Any]


@dataclass(frozen=True)
class ParsedForm4:
    document_type: str | None
    issuer_cik: str | None
    issuer_name: str | None
    issuer_trading_symbol: str | None
    reporting_owners: List[ReportingOwner]
    transactions: List[TransactionRow]


def _strip_ns(tag: str) -> str:
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _find_child(parent: ET.Element | None, name: str) -> Optional[ET.Element]:
    if parent is None:
        return None
    for child in parent:
        if _strip_ns(child.tag) == name:
            return child
    return None


def _find_text(parent: ET.Element | None, path: List[str]) -> Optional[str]:
    cur: Optional[ET.Element] = parent
    for p in path:
        if cur is None:
            return None
        cur = _find_child(cur, p)
    if cur is None:
        return None
    text = (cur.text or "").strip()
    return text if text else None


def _find_value_text(parent: ET.Element | None, path: List[str]) -> Optional[str]:
    """Common SEC pattern: <foo><value>TEXT</value></foo>"""
    return _find_text(parent, path + ["value"])


def _parse_float(s: Optional[str]) -> Optional[float]:
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    # Remove commas
    t = t.replace(",", "")
    try:
        return float(t)
    except Exception:
        return None


def _parse_footnotes(root: ET.Element) -> Dict[str, str]:
    """Extract <footnotes><footnote id="F1">...</footnote>...</footnotes> map."""
    out: Dict[str, str] = {}
    fn_el = _find_child(root, "footnotes")
    if fn_el is None:
        return out
    for child in fn_el:
        if _strip_ns(child.tag).lower() != "footnote":
            continue
        fid = (child.attrib.get("id") or child.attrib.get("ID") or "").strip()
        if not fid:
            continue
        # Footnote text can contain nested tags; itertext is safest.
        text = "".join(child.itertext()).strip()
        if text:
            out[fid] = text
    return out


def parse_form4_xml(xml_text: str) -> ParsedForm4:
    root = ET.fromstring(xml_text)

    # Some filings wrap ownershipDocument; search for it
    if _strip_ns(root.tag).lower() != "ownershipdocument":
        ownership = None
        for el in root.iter():
            if _strip_ns(el.tag).lower() == "ownershipdocument":
                ownership = el
                break
        if ownership is None:
            raise RuntimeError("No ownershipDocument element found in XML")
        root = ownership

    footnote_map = _parse_footnotes(root)

    doc_type = _find_text(root, ["documentType"])

    issuer_el = _find_child(root, "issuer")
    issuer_cik = _find_text(issuer_el, ["issuerCik"]) if issuer_el is not None else None
    issuer_name = _find_text(issuer_el, ["issuerName"]) if issuer_el is not None else None
    issuer_symbol = _find_text(issuer_el, ["issuerTradingSymbol"]) if issuer_el is not None else None

    reporting_owners: List[ReportingOwner] = []
    for ro_el in [c for c in root if _strip_ns(c.tag) == "reportingOwner"]:
        ro_id = _find_child(ro_el, "reportingOwnerId")
        owner_cik = _find_text(ro_id, ["rptOwnerCik"]) if ro_id is not None else None
        owner_name = _find_text(ro_id, ["rptOwnerName"]) if ro_id is not None else None

        rel = _find_child(ro_el, "reportingOwnerRelationship")
        is_dir = _find_text(rel, ["isDirector"]) if rel is not None else None
        is_off = _find_text(rel, ["isOfficer"]) if rel is not None else None
        is_10 = _find_text(rel, ["isTenPercentOwner"]) if rel is not None else None
        title = _find_text(rel, ["officerTitle"]) if rel is not None else None

        def to_bool(v: Optional[str]) -> Optional[bool]:
            if v is None:
                return None
            if v.strip() in ("1", "true", "True"):
                return True
            if v.strip() in ("0", "false", "False"):
                return False
            return None

        reporting_owners.append(
            ReportingOwner(
                owner_cik=(owner_cik.strip() if owner_cik else None),
                owner_name=(owner_name.strip() if owner_name else None),
                is_director=to_bool(is_dir),
                is_officer=to_bool(is_off),
                is_ten_percent_owner=to_bool(is_10),
                officer_title=(title.strip() if title else None),
            )
        )

    transactions: List[TransactionRow] = []

    # Non-derivative
    nd_table = _find_child(root, "nonDerivativeTable")
    if nd_table is not None:
        for tx in nd_table:
            if _strip_ns(tx.tag) != "nonDerivativeTransaction":
                continue
            transactions.append(_parse_transaction(tx, is_derivative=False, footnote_map=footnote_map))

    # Derivative
    d_table = _find_child(root, "derivativeTable")
    if d_table is not None:
        for tx in d_table:
            if _strip_ns(tx.tag) != "derivativeTransaction":
                continue
            transactions.append(_parse_transaction(tx, is_derivative=True, footnote_map=footnote_map))

    _debug(
        f"Parsed Form4: doc_type={doc_type} issuer_cik={issuer_cik} symbol={issuer_symbol} "
        f"owners={len(reporting_owners)} txs={len(transactions)} footnotes={len(footnote_map)}"
    )

    return ParsedForm4(
        document_type=doc_type,
        issuer_cik=issuer_cik.strip() if issuer_cik else None,
        issuer_name=issuer_name,
        issuer_trading_symbol=issuer_symbol,
        reporting_owners=reporting_owners,
        transactions=transactions,
    )


def _parse_transaction(tx_el: ET.Element, is_derivative: bool, footnote_map: Dict[str, str]) -> TransactionRow:
    tx_code = _find_text(tx_el, ["transactionCoding", "transactionCode"])
    tx_date = _find_value_text(tx_el, ["transactionDate"])
    shares = _parse_float(_find_value_text(tx_el, ["transactionAmounts", "transactionShares"]))
    price_raw = _find_value_text(tx_el, ["transactionAmounts", "transactionPricePerShare"])
    shares_follow = _parse_float(
        _find_value_text(tx_el, ["postTransactionAmounts", "sharesOwnedFollowingTransaction"])
    )

    # Preserve a compact raw payload for audit (not the full XML)
    raw: Dict[str, Any] = {
        "transaction_code": tx_code,
        "transaction_date": tx_date,
        "shares": shares,
        "price": price_raw,
        "shares_owned_following": shares_follow,
        "is_derivative": is_derivative,
    }

    acq_disp = _find_value_text(tx_el, ["transactionAmounts", "transactionAcquiredDisposedCode"])
    if acq_disp is not None:
        raw["acquired_disposed"] = acq_disp

    sec_title = _find_value_text(tx_el, ["securityTitle"]) or _find_text(tx_el, ["securityTitle"])
    if sec_title is not None:
        raw["security_title"] = sec_title

    # Footnotes: collect all <footnoteId id="F#"/> references inside the transaction
    footnote_ids: List[str] = []
    for el in tx_el.iter():
        if _strip_ns(el.tag).lower() == "footnoteid":
            fid = (el.attrib.get("id") or el.attrib.get("ID") or "").strip()
            if fid:
                footnote_ids.append(fid)

    if footnote_ids:
        # unique but stable order
        seen: set[str] = set()
        uniq: List[str] = []
        for fid in footnote_ids:
            if fid not in seen:
                seen.add(fid)
                uniq.append(fid)
        raw["footnote_ids"] = uniq
        notes: List[Dict[str, str]] = []
        for fid in uniq:
            txt = footnote_map.get(fid)
            if txt:
                notes.append({"id": fid, "text": txt})
        if notes:
            raw["footnotes"] = notes

    return TransactionRow(
        is_derivative=is_derivative,
        transaction_code=tx_code,
        transaction_date=tx_date,
        shares=shares,
        price=price_raw,
        shares_owned_following=shares_follow,
        raw_payload=raw,
    )
