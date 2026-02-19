from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Header, Response
from pydantic import BaseModel

from fastapi.middleware.cors import CORSMiddleware

from insider_platform.config import Config, load_config
from insider_platform.db import connect, init_db
from insider_platform.util.time import utcnow_iso
from insider_platform.jobs.queue import enqueue_job

from insider_platform.auth import get_current_user, require_admin, require_subscription
from insider_platform.auth.crud import (
    bootstrap_admin_if_needed,
    create_user,
    public_user,
    touch_last_login,
    verify_user_credentials,
)
from insider_platform.auth.security import create_access_token

from insider_platform.billing.stripe_billing import (
    create_billing_portal_session,
    create_checkout_session,
    process_stripe_webhook,
)


def _debug(msg: str) -> None:
    print(f"[api] {msg}")


app = FastAPI(title="Insider Trading Analysis Platform", version="0.2.0")
cfg: Config = load_config()

# CORS is mainly needed for local development (Vite on :5173 -> API on :8000).
# In production (single origin behind a reverse proxy) CORS is typically unnecessary.
_cors_origins = [o.strip() for o in (cfg.CORS_ALLOW_ORIGINS or "").split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )


@app.on_event("startup")
def _on_startup() -> None:
    # Make config available to auth deps.
    app.state.cfg = cfg

    # Ensure schema exists.
    init_db(cfg.DB_DSN)

    # Bootstrap first admin if needed (only when users table is empty)
    boot = bootstrap_admin_if_needed(cfg)
    if boot:
        _debug(
            f"Bootstrapped initial admin user: username={boot.get('username')} role={boot.get('role')}"
        )


# -----------------------------
# Health
# -----------------------------


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok"}


# -----------------------------
# Auth
# -----------------------------

def _cookie_secure(cfg: Config) -> bool:
    """Return whether auth cookies should be marked Secure."""
    samesite = str(getattr(cfg, "AUTH_COOKIE_SAMESITE", "lax") or "lax").lower()
    secure = bool(getattr(cfg, "AUTH_COOKIE_SECURE", False))
    # Browsers require Secure when SameSite=None
    if samesite == "none":
        return True
    return secure

def _set_auth_cookies(response: Response, *, token: str, user: Dict[str, Any], cfg: Config) -> None:
    """Set session cookies for browser-based auth."""
    max_age = int(getattr(cfg, "AUTH_TOKEN_EXPIRE_MINUTES", 10080)) * 60
    cookie_name = str(getattr(cfg, "AUTH_COOKIE_NAME", "ip_token") or "ip_token")
    samesite = str(getattr(cfg, "AUTH_COOKIE_SAMESITE", "lax") or "lax").lower()
    domain = getattr(cfg, "AUTH_COOKIE_DOMAIN", None)
    path = str(getattr(cfg, "AUTH_COOKIE_PATH", "/") or "/")
    secure = _cookie_secure(cfg)

    # Auth token cookie (httpOnly)
    response.set_cookie(
        key=cookie_name,
        value=str(token),
        httponly=True,
        samesite=samesite,
        secure=secure,
        max_age=max_age,
        path=path,
        domain=domain,
    )

    # Convenience cookies (not security-critical)
    role = user.get("role") or ("admin" if user.get("is_admin") else "")
    if role:
        response.set_cookie(
            key="ip_role",
            value=str(role),
            httponly=False,
            samesite=samesite,
            secure=secure,
            max_age=max_age,
            path=path,
            domain=domain,
        )

    sub = user.get("subscription_status") or ""
    response.set_cookie(
        key="ip_sub",
        value=str(sub),
        httponly=False,
        samesite=samesite,
        secure=secure,
        max_age=max_age,
        path=path,
        domain=domain,
    )

def _clear_auth_cookies(response: Response, cfg: Config) -> None:
    cookie_name = str(getattr(cfg, "AUTH_COOKIE_NAME", "ip_token") or "ip_token")
    domain = getattr(cfg, "AUTH_COOKIE_DOMAIN", None)
    path = str(getattr(cfg, "AUTH_COOKIE_PATH", "/") or "/")
    response.delete_cookie(key=cookie_name, path=path, domain=domain)
    response.delete_cookie(key="ip_role", path=path, domain=domain)
    response.delete_cookie(key="ip_sub", path=path, domain=domain)



class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    """Public self-serve registration.

    NOTE: We keep the project model as a simple username/password system.
    In production, "username" should be treated as the customer's email.
    """

    username: str
    password: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"  # admin|user


@app.post("/auth/login")
def auth_login(payload: LoginRequest, response: Response) -> Dict[str, Any]:
    with connect(cfg.DB_DSN) as conn:
        user_row = verify_user_credentials(conn, payload.username, payload.password)
        if user_row is None:
            raise HTTPException(status_code=401, detail="invalid_credentials")

        touch_last_login(conn, int(user_row["user_id"]))

        token = create_access_token(
            secret=cfg.AUTH_JWT_SECRET,
            user_id=int(user_row["user_id"]),
            username=str(user_row["username"]),
            role=str(user_row["role"]),
            expires_minutes=int(cfg.AUTH_TOKEN_EXPIRE_MINUTES),
        )

        u = public_user(user_row)
        u["is_admin"] = (u.get("role") == "admin")

        # Set browser session cookies (httpOnly JWT + convenience metadata cookies).
        _set_auth_cookies(response, token=token, user=u, cfg=cfg)

        return {"access_token": token, "token_type": "bearer", "user": u}


@app.post("/auth/register")
def auth_register(payload: RegisterRequest, response: Response) -> Dict[str, Any]:
    """Create a new user account.

    This endpoint is intentionally simple to unblock productization.
    Consider adding email verification + rate limiting before public launch.
    """

    username = (payload.username or "").strip().lower()
    password = payload.password or ""
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="username_too_short")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="password_too_short")

    with connect(cfg.DB_DSN) as conn:
        try:
            u = create_user(conn, username=username, password=password, role="user")
        except ValueError as e:
            detail = str(e)
            if detail == "username_exists":
                raise HTTPException(status_code=409, detail=detail)
            raise HTTPException(status_code=400, detail=detail)

        token = create_access_token(
            secret=cfg.AUTH_JWT_SECRET,
            user_id=int(u["user_id"]),
            username=str(u["username"]),
            role=str(u["role"]),
            expires_minutes=int(cfg.AUTH_TOKEN_EXPIRE_MINUTES),
        )
        u["is_admin"] = (u.get("role") == "admin")

        _set_auth_cookies(response, token=token, user=u, cfg=cfg)

        return {"access_token": token, "token_type": "bearer", "user": u}




@app.post("/auth/logout")
def auth_logout(response: Response) -> Dict[str, Any]:
    """Clear browser session cookies."""
    _clear_auth_cookies(response, cfg)
    return {"ok": True}

@app.get("/auth/me")
def auth_me(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return {"user": user}


# Admin: create users
@app.post("/admin/users")
def admin_create_user(
    payload: CreateUserRequest,
    _admin: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    with connect(cfg.DB_DSN) as conn:
        try:
            u = create_user(conn, username=payload.username, password=payload.password, role=payload.role)
        except ValueError as e:
            detail = str(e)
            if detail == "username_exists":
                raise HTTPException(status_code=409, detail=detail)
            raise HTTPException(status_code=400, detail=detail)
    return {"user": u}


# -----------------------------
# Billing (Stripe)
# -----------------------------


class CheckoutSessionRequest(BaseModel):
    plan: str = "monthly"  # monthly|yearly


@app.get("/billing/plans")
def billing_plans() -> Dict[str, Any]:
    """Expose configured plan price IDs so the frontend can render pricing."""
    return {
        "monthly": cfg.STRIPE_PRICE_ID_MONTHLY,
        "yearly": cfg.STRIPE_PRICE_ID_YEARLY,
        "enabled": bool(cfg.STRIPE_SECRET_KEY and (cfg.STRIPE_PRICE_ID_MONTHLY or cfg.STRIPE_PRICE_ID_YEARLY)),
    }


@app.get("/billing/status")
def billing_status(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Return current user's subscription state."""
    return {
        "user": user,
        "billing_enabled": bool(cfg.STRIPE_SECRET_KEY and (cfg.STRIPE_PRICE_ID_MONTHLY or cfg.STRIPE_PRICE_ID_YEARLY)),
    }


@app.post("/billing/checkout-session")
def billing_checkout_session(
    payload: CheckoutSessionRequest,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Create a Stripe Checkout session for the logged-in user."""
    plan = (payload.plan or "monthly").strip().lower()
    if plan not in ("monthly", "yearly"):
        raise HTTPException(status_code=400, detail="invalid_plan")

    price_id = cfg.STRIPE_PRICE_ID_MONTHLY if plan == "monthly" else cfg.STRIPE_PRICE_ID_YEARLY
    if not price_id:
        raise HTTPException(status_code=400, detail="plan_not_configured")

    # Stripe will redirect back to your public site.
    success_url = f"{cfg.PUBLIC_APP_URL.rstrip('/')}/app/account?checkout=success"
    cancel_url = f"{cfg.PUBLIC_APP_URL.rstrip('/')}/pricing?checkout=cancel"

    try:
        url = create_checkout_session(
            cfg,
            user_id=int(user.get("user_id")),
            price_id=str(price_id),
            success_url=success_url,
            cancel_url=cancel_url,
            customer_id=(user.get("stripe_customer_id") or None),
            customer_email=str(user.get("username")) if user.get("username") else None,
        )
        return {"url": url}
    except RuntimeError as e:
        # Stripe missing / not configured.
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"billing_error: {e}")


@app.post("/billing/portal-session")
def billing_portal_session(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Create a Stripe Customer Portal session."""
    customer_id = (user.get("stripe_customer_id") or "").strip()
    if not customer_id:
        raise HTTPException(status_code=400, detail="stripe_customer_missing")

    return_url = f"{cfg.PUBLIC_APP_URL.rstrip('/')}/app/account"
    try:
        url = create_billing_portal_session(cfg, customer_id=customer_id, return_url=return_url)
        return {"url": url}
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"billing_error: {e}")


@app.post("/billing/stripe/webhook")
async def billing_stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
) -> Dict[str, Any]:
    """Stripe webhook endpoint.

    Configure this in Stripe as:
      https://YOUR_DOMAIN/api/backend/billing/stripe/webhook
    (or route directly to the backend if you don't use the Next.js proxy).
    """
    payload_bytes = await request.body()
    try:
        event_id, processed = process_stripe_webhook(cfg, payload_bytes=payload_bytes, signature=stripe_signature)
        return {"ok": True, "event_id": event_id, "processed": processed}
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"webhook_error: {e}")


# -----------------------------
# Feedback
# -----------------------------


class FeedbackRequest(BaseModel):
    message: str
    page_url: Optional[str] = None
    rating: Optional[int] = None  # 1-5
    metadata: Optional[Dict[str, Any]] = None


@app.post("/feedback")
def submit_feedback(
    payload: FeedbackRequest,
    user: Dict[str, Any] = Depends(require_subscription),
) -> Dict[str, Any]:
    msg = (payload.message or "").strip()
    if len(msg) < 3:
        raise HTTPException(status_code=400, detail="message_too_short")

    rating = payload.rating
    if rating is not None and (rating < 1 or rating > 5):
        raise HTTPException(status_code=400, detail="invalid_rating")

    with connect(cfg.DB_DSN) as conn:
        conn.execute(
            """
            INSERT INTO user_feedback (user_id, message, page_url, rating, metadata_json, created_at)
            VALUES (?,?,?,?,?,?)
            """,
            (
                int(user.get("user_id")),
                msg,
                payload.page_url,
                rating,
                json.dumps(payload.metadata or {}),
                datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            ),
        )

    return {"ok": True}


@app.get("/admin/feedback")
def admin_list_feedback(
    limit: int = Query(100, ge=1, le=500),
    _admin: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    with connect(cfg.DB_DSN) as conn:
        rows = conn.execute(
            """
            SELECT f.feedback_id, f.user_id, u.username, f.message, f.page_url, f.rating, f.created_at
            FROM user_feedback f
            JOIN users u ON u.user_id = f.user_id
            ORDER BY f.created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return {"feedback": [dict(r) for r in rows]}


# -----------------------------
# Tickers
# -----------------------------


@app.get("/tickers")
def list_tickers(
    limit: int = Query(200, ge=1, le=500),
    q: Optional[str] = None,
    user: Dict[str, Any] = Depends(require_subscription),
) -> List[Dict[str, Any]]:
    """List issuers (tickers) with summary stats.

    NOTE: issuer_master.last_filing_date can be stale. We compute last filing date
    from filings when possible.
    """

    qn = (q or "").strip()
    like = f"%{qn}%" if qn else None

    with connect(cfg.DB_DSN) as conn:
        sql = """
        SELECT
            im.issuer_cik,
            im.current_ticker,
            im.issuer_name,
            COALESCE(
                (SELECT MAX(f.filing_date) FROM filings f WHERE f.issuer_cik = im.issuer_cik),
                im.last_filing_date
            ) AS last_filing_date,
            (
                SELECT COUNT(*)
                FROM insider_events e
                WHERE e.issuer_cik = im.issuer_cik
                  AND (e.has_buy=1 OR e.has_sell=1)
            ) AS open_market_event_count,
            (
                SELECT COUNT(*)
                FROM insider_events e
                WHERE e.issuer_cik = im.issuer_cik
                  AND (e.ai_buy_rating IS NOT NULL OR e.ai_sell_rating IS NOT NULL OR e.ai_confidence IS NOT NULL)
            ) AS ai_event_count,
            (
                SELECT COUNT(*)
                FROM insider_events e
                WHERE e.issuer_cik = im.issuer_cik
                  AND (e.cluster_flag_buy=1 OR e.cluster_flag_sell=1)
            ) AS cluster_event_count,
            m.market_cap,
            m.market_cap_bucket,
            m.market_cap_updated_at
        FROM issuer_master im
        LEFT JOIN market_cap_cache m ON m.ticker = im.current_ticker
        WHERE im.current_ticker IS NOT NULL
        """
        params: List[Any] = []

        if like is not None:
            sql += " AND (im.current_ticker LIKE ? OR im.issuer_name LIKE ? OR im.issuer_cik LIKE ?)"
            params.extend([like, like, like])

        sql += " ORDER BY (last_filing_date IS NULL) ASC, last_filing_date DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(sql, tuple(params)).fetchall()
        return [dict(r) for r in rows]


# -----------------------------
# Events (ticker list)
# -----------------------------
@app.get("/ticker/{ticker}/events")
def ticker_events(
    ticker: str,
    days: Optional[int] = Query(None, ge=1, le=3650, description="Optional lookback window in days"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0, le=50000),
    open_market_only: bool = True,
    cluster_only: bool = False,
    ai_only: bool = False,
    side: str = Query("both"),
    officer_only: bool = False,
    director_only: bool = False,
    ten_percent_only: bool = False,
    min_dollars: Optional[float] = None,
    dollars_side: str = Query("either"),
    sort_by: str = Query("filing_date_desc"),
    include_total: bool = False,
    auto_enqueue_reparse: bool = False,
    user: Dict[str, Any] = Depends(require_subscription),
) -> Dict[str, Any]:
    """List events for a ticker.

    Security / product rules:
    - Non-admins are forced to open_market_only=True.
    - Only admins can enable auto_enqueue_reparse.
    """

    t = ticker.strip().upper()
    side = (side or "both").strip().lower()
    if side not in ("both", "buy", "sell"):
        raise HTTPException(status_code=400, detail="invalid_side")

    dollars_side = (dollars_side or "either").strip().lower()
    if dollars_side not in ("either", "buy", "sell"):
        raise HTTPException(status_code=400, detail="invalid_dollars_side")

    sort_by = (sort_by or "filing_date_desc").strip().lower()
    if sort_by not in ("filing_date_desc", "ai_best_desc"):
        raise HTTPException(status_code=400, detail="invalid_sort_by")

    if not user.get("is_admin"):
        open_market_only = True
        auto_enqueue_reparse = False

    with connect(cfg.DB_DSN) as conn:
        issuer = conn.execute(
            """
            SELECT issuer_cik, current_ticker, issuer_name
            FROM issuer_master
            WHERE current_ticker=?
            """,
            (t,),
        ).fetchone()

        market_cap = conn.execute(
            "SELECT * FROM market_cap_cache WHERE ticker=?",
            (t,),
        ).fetchone()

        # Detect stale parse version (do not enqueue unless admin explicitly asks)
        stale = conn.execute(
            "SELECT 1 FROM insider_events WHERE ticker=? AND parse_version<>? LIMIT 1",
            (t, cfg.CURRENT_PARSE_VERSION),
        ).fetchone()
        reparse_needed = stale is not None

        reparse_enqueued = False
        if reparse_needed and auto_enqueue_reparse and user.get("is_admin"):
            enqueue_job(
                conn,
                job_type="REPARSE_TICKER",
                dedupe_key=f"REPARSE|{t}|{cfg.CURRENT_PARSE_VERSION}",
                payload={"ticker": t},
                priority=1,
                max_attempts=1,
            )
            reparse_enqueued = True

        where = ["e.ticker=?"]
        params: List[Any] = [t]

        if days is not None:
            start_date = (date.today() - timedelta(days=int(days))).isoformat()
            where.append("e.filing_date >= ?")
            params.append(start_date)

        if open_market_only:
            where.append("(e.has_buy=1 OR e.has_sell=1)")

        if cluster_only:
            where.append("(e.cluster_flag_buy=1 OR e.cluster_flag_sell=1)")

        if ai_only:
            where.append("(e.ai_buy_rating IS NOT NULL OR e.ai_sell_rating IS NOT NULL OR e.ai_confidence IS NOT NULL)")

        if side == "buy":
            where.append("e.has_buy=1")
        elif side == "sell":
            where.append("e.has_sell=1")

        if officer_only:
            where.append("e.is_officer=1")
        if director_only:
            where.append("e.is_director=1")
        if ten_percent_only:
            where.append("e.is_ten_percent_owner=1")

        if min_dollars is not None:
            try:
                md = float(min_dollars)
            except Exception:
                raise HTTPException(status_code=400, detail="min_dollars_not_numeric")
            if dollars_side == "buy":
                where.append("COALESCE(e.buy_dollars_total,0) >= ?")
                params.append(md)
            elif dollars_side == "sell":
                where.append("COALESCE(e.sell_dollars_total,0) >= ?")
                params.append(md)
            else:
                where.append("(COALESCE(e.buy_dollars_total,0) >= ? OR COALESCE(e.sell_dollars_total,0) >= ?)")
                params.extend([md, md])

        where_sql = " AND ".join(where)

        order_sql = ""
        if sort_by == "filing_date_desc":
            order_sql = "ORDER BY e.filing_date DESC, e.event_trade_date DESC"
        else:
            # best AI rating is scalar max() of buy/sell ratings (null -> -1)
            order_sql = """
            ORDER BY
              GREATEST(COALESCE(e.ai_buy_rating, -1), COALESCE(e.ai_sell_rating, -1)) as ai_best,
              COALESCE(e.ai_confidence,-1) DESC,
              e.filing_date DESC
            """

        total: Optional[int] = None
        if include_total:
            total = conn.execute(
                f"SELECT COUNT(*) AS n FROM insider_events e WHERE {where_sql}",
                tuple(params),
            ).fetchone()["n"]

        rows = conn.execute(
            f"""
            SELECT
              e.*,
              GREATEST(COALESCE(e.ai_buy_rating,-1), COALESCE(e.ai_sell_rating,-1)) AS ai_best
            FROM insider_events e
            WHERE {where_sql}
            {order_sql}
            LIMIT ? OFFSET ?
            """,
            (*params, limit, offset),
        ).fetchall()

        events = [dict(r) for r in rows]
        next_offset = offset + len(events)
        if len(events) < limit:
            next_offset = None

        return {
            "ticker": t,
            "days": days,
            "issuer": dict(issuer) if issuer is not None else None,
            "market_cap": dict(market_cap) if market_cap is not None else None,
            "reparse_needed": reparse_needed,
            "reparse_enqueued": reparse_enqueued,
            "events": events,
            "offset": offset,
            "limit": limit,
            "next_offset": next_offset,
            "total": total,
        }


# -----------------------------
# Events (global feed)
# -----------------------------


@app.get("/events")
def list_events(
    days: int = Query(30, ge=1, le=3650, description="Lookback window in days"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0, le=50000),
    open_market_only: bool = True,
    cluster_only: bool = False,
    ai_only: bool = True,
    sort_by: str = Query("ai_best_desc"),
    user: Dict[str, Any] = Depends(require_subscription),
) -> Dict[str, Any]:
    """Global events feed, intended for "Top signals" style views.

    Defaults:
      - last 30 days
      - ai_only=True
      - sorted by best AI rating desc
      - open_market_only=True for non-admins
    """

    sort_by = (sort_by or "ai_best_desc").strip().lower()
    if sort_by not in ("ai_best_desc", "filing_date_desc"):
        raise HTTPException(status_code=400, detail="invalid_sort_by")

    if not user.get("is_admin"):
        open_market_only = True

    start_date = (date.today() - timedelta(days=int(days))).isoformat()

    where = ["e.filing_date >= ?"]
    params: List[Any] = [start_date]

    if open_market_only:
        where.append("(e.has_buy=1 OR e.has_sell=1)")

    if cluster_only:
        where.append("(e.cluster_flag_buy=1 OR e.cluster_flag_sell=1)")

    if ai_only:
        where.append("(e.ai_buy_rating IS NOT NULL OR e.ai_sell_rating IS NOT NULL OR e.ai_confidence IS NOT NULL)")

    where_sql = " AND ".join(where)

    if sort_by == "filing_date_desc":
        order_sql = "ORDER BY e.filing_date DESC, e.event_trade_date DESC"
    else:
        order_sql = """
        ORDER BY
          GREATEST(COALESCE(e.ai_buy_rating,-1), COALESCE(e.ai_sell_rating,-1)) DESC,
          COALESCE(e.ai_confidence,-1) DESC,
          e.filing_date DESC
        """

    with connect(cfg.DB_DSN) as conn:
        rows = conn.execute(
            f"""
            SELECT
              e.*,
              GREATEST(COALESCE(e.ai_buy_rating,-1), COALESCE(e.ai_sell_rating,-1)) AS best_ai_rating,
              im.issuer_name AS issuer_name
            FROM insider_events e
            LEFT JOIN issuer_master im ON im.issuer_cik = e.issuer_cik
            WHERE {where_sql}
            {order_sql}
            LIMIT ? OFFSET ?
            """,
            (*params, limit, offset),
        ).fetchall()

        events = [dict(r) for r in rows]
        next_offset = offset + len(events)
        if len(events) < limit:
            next_offset = None

        return {
            "days": days,
            "offset": offset,
            "limit": limit,
            "next_offset": next_offset,
            "sort_by": sort_by,
            "events": events,
        }


# -----------------------------
# Event detail
# -----------------------------


@app.get("/event/{issuer_cik}/{owner_key}/{accession_number}")
def get_event(
    issuer_cik: str,
    owner_key: str,
    accession_number: str,
    user: Dict[str, Any] = Depends(require_subscription),
) -> Dict[str, Any]:
    with connect(cfg.DB_DSN) as conn:
        cik = issuer_cik.zfill(10)
        row = conn.execute(
            """
            SELECT * FROM insider_events
            WHERE issuer_cik=? AND owner_key=? AND accession_number=?
            """,
            (cik, owner_key, accession_number),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="event_not_found")

        event = dict(row)

        # Enforce open_market_only for non-admin users even on direct event access.
        # (Admins may browse non-open-market events.)
        if not user.get("is_admin"):
            if not (int(event.get("has_buy") or 0) == 1 or int(event.get("has_sell") or 0) == 1):
                raise HTTPException(status_code=403, detail="open_market_only")

        outcomes = conn.execute(
            """
            SELECT * FROM event_outcomes
            WHERE issuer_cik=? AND owner_key=? AND accession_number=?
            """,
            (cik, owner_key, accession_number),
        ).fetchall()

        stats = conn.execute(
            """
            SELECT * FROM insider_issuer_stats
            WHERE issuer_cik=? AND owner_key=?
            """,
            (cik, owner_key),
        ).fetchall()

        rows_raw = conn.execute(
            """
            SELECT
              row_id,
              is_derivative,
              transaction_code,
              transaction_date,
              shares_abs,
              price,
              shares_owned_following,
              parser_warnings_json
            FROM form4_rows_raw
            WHERE issuer_cik=? AND owner_key=? AND accession_number=?
            ORDER BY (transaction_date IS NULL) ASC, transaction_date ASC, row_id ASC
            """,
            (cik, owner_key, accession_number),
        ).fetchall()

        # Cluster summaries (optional)
        buy_cluster = None
        sell_cluster = None
        if event.get("cluster_id_buy"):
            buy_cluster = conn.execute(
                "SELECT * FROM clusters WHERE cluster_id=?",
                (event["cluster_id_buy"],),
            ).fetchone()
        if event.get("cluster_id_sell"):
            sell_cluster = conn.execute(
                "SELECT * FROM clusters WHERE cluster_id=?",
                (event["cluster_id_sell"],),
            ).fetchone()

        ai = conn.execute(
            """
            SELECT * FROM ai_outputs
            WHERE issuer_cik=? AND owner_key=? AND accession_number=?
            ORDER BY ai_output_id DESC LIMIT 1
            """,
            (cik, owner_key, accession_number),
        ).fetchone()

        ai_latest = None
        if ai is not None:
            d = dict(ai)
            try:
                d["output"] = json.loads(d.get("output_json") or "null")
            except Exception:
                d["output"] = None
            try:
                d["input"] = json.loads(d.get("input_json") or "null")
            except Exception:
                d["input"] = None

            # Drop big raw strings (we provide parsed objects instead)
            d.pop("output_json", None)
            d.pop("input_json", None)

            ai_latest = d
        return {
            "event": event,
            "rows": [dict(r) for r in rows_raw],
            "outcomes": [dict(r) for r in outcomes],
            "stats": [dict(r) for r in stats],
            "clusters": {
                "buy": dict(buy_cluster) if buy_cluster is not None else None,
                "sell": dict(sell_cluster) if sell_cluster is not None else None,
            },
            "ai_latest": ai_latest,
        }


# -----------------------------
# Prices (for charts)
# -----------------------------


@app.get("/ticker/{ticker}/prices")
def ticker_prices(
    ticker: str,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = Query(2000, ge=1, le=20000),
    user: Dict[str, Any] = Depends(require_subscription),
) -> Dict[str, Any]:
    t = ticker.strip().upper()

    def _parse_date(s: Optional[str]) -> Optional[str]:
        if not s:
            return None
        try:
            # accept YYYY-MM-DD
            date.fromisoformat(s)
            return s
        except Exception:
            raise HTTPException(status_code=400, detail=f"invalid_date: {s}")

    start_s = _parse_date(start)
    end_s = _parse_date(end)

    today = datetime.now(timezone.utc).date().isoformat()
    if end_s is None:
        end_s = today
    if start_s is None:
        # default 1y lookback
        d = datetime.fromisoformat(end_s).date() - timedelta(days=365)
        start_s = d.isoformat()

    with connect(cfg.DB_DSN) as conn:
        issuer = conn.execute(
            "SELECT issuer_cik, current_ticker FROM issuer_master WHERE current_ticker=?",
            (t,),
        ).fetchone()

        issuer_cik = None
        if issuer is not None:
            issuer_cik = issuer["issuer_cik"]
        else:
            # Fallback: look up from events (if issuer_master isn't populated)
            r = conn.execute(
                "SELECT issuer_cik FROM insider_events WHERE ticker=? LIMIT 1",
                (t,),
            ).fetchone()
            if r is not None:
                issuer_cik = r["issuer_cik"]

        if not issuer_cik:
            raise HTTPException(status_code=404, detail="ticker_not_found")

        rows = conn.execute(
            """
            SELECT date, adj_close
            FROM issuer_prices_daily
            WHERE issuer_cik=? AND date>=? AND date<=?
            ORDER BY date ASC
            LIMIT ?
            """,
            (issuer_cik, start_s, end_s, limit),
        ).fetchall()

        return {
            "ticker": t,
            "issuer_cik": issuer_cik,
            "start": start_s,
            "end": end_s,
            "prices": [dict(r) for r in rows],
        }


# -----------------------------
# Admin-only ops endpoints (read-only for now)
# -----------------------------


@app.get("/admin/jobs")
def admin_jobs(
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    _admin: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    with connect(cfg.DB_DSN) as conn:
        # Always return status counts for quick triage
        crows = conn.execute(
            "SELECT status, COUNT(*) AS count FROM jobs GROUP BY status ORDER BY status"
        ).fetchall()
        counts = {str(r["status"]): int(r["count"]) for r in crows}

        where = ""
        params: List[Any] = []
        if status:
            st = status.strip().lower()
            if st not in ("pending", "running", "success", "error"):
                raise HTTPException(status_code=400, detail="invalid_job_status")
            where = "WHERE status=?"
            params.append(st)

        rows = conn.execute(
            f"""
            SELECT *
            FROM jobs
            {where}
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (*params, limit),
        ).fetchall()

        return {"jobs": [dict(r) for r in rows], "counts": counts}


@app.get("/admin/monitoring")
def admin_monitoring(
    window_hours: int = Query(24, ge=1, le=168),
    limit_types: int = Query(25, ge=1, le=200),
    _admin: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """Lightweight operational metrics for admins.

    Designed to help decide when to run more workers:
    - queue depth (pending by job_type)
    - throughput over time (success/error per hour)
    - end-to-end latency (enqueue -> completed for successful jobs)
    - recent errors
    """

    def _to_int(x: Any) -> int:
        try:
            return int(x or 0)
        except Exception:
            return 0

    def _to_float(x: Any) -> float | None:
        if x is None:
            return None
        try:
            return float(x)
        except Exception:
            return None

    with connect(cfg.DB_DSN) as conn:
        dialect = str(getattr(conn, "dialect", "sqlite"))

        # Status counts
        srows = conn.execute(
            "SELECT status, COUNT(*) AS count FROM jobs GROUP BY status ORDER BY status"
        ).fetchall()
        status_counts = {str(r["status"]): _to_int(r["count"]) for r in srows}

        # Oldest pending age (seconds)
        oldest_pending_age_sec: float | None = None
        if status_counts.get("pending", 0) > 0:
            if dialect == "postgres":
                r = conn.execute(
                    """
                    SELECT EXTRACT(EPOCH FROM (NOW() - MIN(created_at::timestamptz))) AS age_sec
                    FROM jobs
                    WHERE status='pending'
                    """
                ).fetchone()
                oldest_pending_age_sec = _to_float(r["age_sec"] if r else None)
            else:
                r = conn.execute(
                    "SELECT MIN(created_at) AS oldest FROM jobs WHERE status='pending'"
                ).fetchone()
                if r and r.get("oldest"):
                    try:
                        oldest = str(r["oldest"]).replace("Z", "+00:00")
                        dt_oldest = datetime.fromisoformat(oldest)
                        oldest_pending_age_sec = float((datetime.now(timezone.utc) - dt_oldest).total_seconds())
                    except Exception:
                        oldest_pending_age_sec = None

        # Pending + error breakdown
        pending_by_type = conn.execute(
            """
            SELECT job_type, COUNT(*) AS count
            FROM jobs
            WHERE status='pending'
            GROUP BY job_type
            ORDER BY count DESC
            LIMIT ?
            """,
            (limit_types,),
        ).fetchall()

        error_by_type = conn.execute(
            """
            SELECT job_type, COUNT(*) AS count
            FROM jobs
            WHERE status='error'
            GROUP BY job_type
            ORDER BY count DESC
            LIMIT ?
            """,
            (limit_types,),
        ).fetchall()

        # Throughput per hour
        if dialect == "postgres":
            trows = conn.execute(
                """
                SELECT date_trunc('hour', updated_at::timestamptz) AS bucket,
                       status,
                       COUNT(*) AS count
                FROM jobs
                WHERE status IN ('success','error')
                  AND updated_at::timestamptz >= (NOW() - (? * INTERVAL '1 hour'))
                GROUP BY bucket, status
                ORDER BY bucket ASC
                """,
                (window_hours,),
            ).fetchall()
        else:
            start_iso = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat().replace(
                "+00:00", "Z"
            )
            trows = conn.execute(
                """
                SELECT substr(updated_at, 1, 13) AS bucket,
                       status,
                       COUNT(*) AS count
                FROM jobs
                WHERE status IN ('success','error')
                  AND updated_at >= ?
                GROUP BY bucket, status
                ORDER BY bucket ASC
                """,
                (start_iso,),
            ).fetchall()

        # Build full bucket list so the chart is stable.
        end_bucket = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        start_bucket = end_bucket - timedelta(hours=max(window_hours - 1, 0))
        buckets = [start_bucket + timedelta(hours=i) for i in range(window_hours)]
        points: Dict[str, Dict[str, Any]] = {
            b.isoformat().replace("+00:00", "Z"): {"hour": b.isoformat().replace("+00:00", "Z"), "success": 0, "error": 0}
            for b in buckets
        }

        for r in trows:
            st = str(r["status"]) if r.get("status") is not None else ""
            if st not in ("success", "error"):
                continue

            bucket_val = r.get("bucket")
            if dialect == "postgres":
                # date_trunc(timestamptz) returns a datetime
                if isinstance(bucket_val, datetime):
                    bdt = bucket_val
                else:
                    try:
                        bdt = datetime.fromisoformat(str(bucket_val).replace("Z", "+00:00"))
                    except Exception:
                        continue
                bkey = bdt.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0).isoformat().replace(
                    "+00:00", "Z"
                )
            else:
                b = str(bucket_val)
                # sqlite bucket is 'YYYY-MM-DDTHH'
                bkey = (b + ":00:00Z") if len(b) == 13 else b

            if bkey not in points:
                # If the DB returns a bucket slightly outside the generated range, ignore it.
                continue

            points[bkey][st] = _to_int(r.get("count"))

        throughput_hourly = [points[k] for k in sorted(points.keys())]

        # Latency (successful jobs only)
        if dialect == "postgres":
            lrows = conn.execute(
                """
                WITH base AS (
                  SELECT job_type,
                         EXTRACT(EPOCH FROM (updated_at::timestamptz - created_at::timestamptz)) AS latency_sec
                  FROM jobs
                  WHERE status='success'
                    AND updated_at::timestamptz >= (NOW() - (? * INTERVAL '1 hour'))
                )
                SELECT job_type,
                       COUNT(*) AS n,
                       AVG(latency_sec) AS avg_sec,
                       percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_sec) AS p50_sec,
                       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_sec) AS p95_sec
                FROM base
                GROUP BY job_type
                ORDER BY n DESC
                LIMIT ?
                """,
                (window_hours, limit_types),
            ).fetchall()
        else:
            start_iso = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat().replace(
                "+00:00", "Z"
            )
            lrows = conn.execute(
                """
                SELECT job_type,
                       COUNT(*) AS n,
                       AVG((julianday(updated_at) - julianday(created_at)) * 86400.0) AS avg_sec
                FROM jobs
                WHERE status='success' AND updated_at >= ?
                GROUP BY job_type
                ORDER BY n DESC
                LIMIT ?
                """,
                (start_iso, limit_types),
            ).fetchall()

        latency_by_type: List[Dict[str, Any]] = []
        for r in lrows:
            latency_by_type.append(
                {
                    "job_type": str(r.get("job_type")),
                    "n": _to_int(r.get("n")),
                    "avg_sec": _to_float(r.get("avg_sec")),
                    "p50_sec": _to_float(r.get("p50_sec")) if "p50_sec" in r else None,
                    "p95_sec": _to_float(r.get("p95_sec")) if "p95_sec" in r else None,
                }
            )

        # Backfill queue counts
        try:
            bq = conn.execute(
                "SELECT status, COUNT(*) AS count FROM backfill_queue GROUP BY status ORDER BY status"
            ).fetchall()
            backfill_counts = [{"status": str(r["status"]), "count": _to_int(r["count"])} for r in bq]
        except Exception:
            backfill_counts = []

        # Small table snapshots
        table_counts: Dict[str, int] = {}
        for table in ("issuer_master", "insider_events", "ai_outputs", "users"):
            try:
                r = conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()
                table_counts[table] = _to_int(r.get("n") if r else 0)
            except Exception:
                table_counts[table] = 0

        # Recent errors
        erows = conn.execute(
            """
            SELECT job_id, job_type, status, dedupe_key, attempts, last_error, created_at, updated_at
            FROM jobs
            WHERE status='error'
            ORDER BY updated_at DESC
            LIMIT 50
            """
        ).fetchall()

        return {
            "now": utcnow_iso(),
            "window_hours": window_hours,
            "dialect": dialect,
            "status_counts": status_counts,
            "oldest_pending_age_sec": oldest_pending_age_sec,
            "pending_by_type": [
                {"job_type": str(r["job_type"]), "count": _to_int(r["count"])} for r in pending_by_type
            ],
            "error_by_type": [
                {"job_type": str(r["job_type"]), "count": _to_int(r["count"])} for r in error_by_type
            ],
            "throughput_hourly": throughput_hourly,
            "latency_by_type": latency_by_type,
            "backfill_counts": backfill_counts,
            "table_counts": table_counts,
            "recent_errors": [dict(r) for r in erows],
        }


@app.post("/admin/enqueue/reparse_ticker")
def admin_reparse_ticker(
    payload: Dict[str, Any],
    _admin: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    t = str(payload.get("ticker") or "").strip().upper()
    if not t:
        raise HTTPException(status_code=400, detail="missing_ticker")

    with connect(cfg.DB_DSN) as conn:
        enqueue_job(
            conn,
            job_type="REPARSE_TICKER",
            dedupe_key=f"REPARSE|{t}|{cfg.CURRENT_PARSE_VERSION}",
            payload={"ticker": t},
            priority=1,
            max_attempts=1,
        )
    return {"enqueued": True, "ticker": t}


@app.post("/ingest/accession")
def ingest_accession_endpoint(
    payload: Dict[str, Any],
    _admin: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    accession = str(payload.get("accession_number") or "").strip()
    if not accession:
        raise HTTPException(status_code=400, detail="missing_accession_number")

    with connect(cfg.DB_DSN) as conn:
        enqueue_job(
            conn,
            job_type="FETCH_ACCESSION_DOCS",
            dedupe_key=f"FETCH|{accession}",
            payload={"accession_number": accession},
            priority=1,
        )
    return {"enqueued": True, "accession_number": accession}


class BackfillRequest(BaseModel):
    start_year: int | None = None
    batch_size: int | None = None


@app.post("/admin/backfill_ticker/{ticker}")
def admin_backfill_ticker(
    ticker: str,
    payload: BackfillRequest,
    _admin: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    t = ticker.strip().upper()
    if not t:
        raise HTTPException(status_code=400, detail="missing_ticker")

    start_year = int(payload.start_year or cfg.BACKFILL_START_YEAR)
    batch_size = int(payload.batch_size or cfg.BACKFILL_BATCH_SIZE)

    with connect(cfg.DB_DSN) as conn:
        row = conn.execute(
            "SELECT issuer_cik FROM issuer_master WHERE current_ticker=?",
            (t,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="ticker_not_found")

        cik = str(row["issuer_cik"]).zfill(10)

        enqueue_job(
            conn,
            job_type="BACKFILL_DISCOVER_ISSUER",
            dedupe_key=f"BACKFILL_DISCOVER|{cik}|{start_year}",
            payload={"issuer_cik": cik, "start_year": start_year, "batch_size": batch_size},
            priority=3,
            requeue_if_exists=True,
        )

        # Ensure benchmark series exists for excess-return stats (optional but helpful)
        enqueue_job(
            conn,
            job_type="FETCH_BENCHMARK_PRICES",
            dedupe_key=f"BENCH_PRICES|{cfg.BENCHMARK_SYMBOL}",
            payload={"symbol": cfg.BENCHMARK_SYMBOL},
            priority=1,
            requeue_if_exists=True,
        )

    return {
        "enqueued": True,
        "ticker": t,
        "issuer_cik": cik,
        "start_year": start_year,
        "batch_size": batch_size,
    }


@app.post("/admin/fetch_benchmark_prices")
def admin_fetch_benchmark_prices(
    _admin: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    with connect(cfg.DB_DSN) as conn:
        enqueue_job(
            conn,
            job_type="FETCH_BENCHMARK_PRICES",
            dedupe_key=f"BENCH_PRICES|{cfg.BENCHMARK_SYMBOL}",
            payload={"symbol": cfg.BENCHMARK_SYMBOL},
            priority=1,
            requeue_if_exists=True,
        )
    return {"enqueued": True, "symbol": cfg.BENCHMARK_SYMBOL}


class RegenerateAIRequest(BaseModel):
    force: bool = True


@app.post("/admin/event/{issuer_cik}/{owner_key}/{accession_number}/regenerate_ai")
def admin_regenerate_ai(
    issuer_cik: str,
    owner_key: str,
    accession_number: str,
    payload: RegenerateAIRequest,
    _admin: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    cik = issuer_cik.zfill(10)
    acc = accession_number.strip()
    if not acc:
        raise HTTPException(status_code=400, detail="missing_accession_number")

    with connect(cfg.DB_DSN) as conn:
        enqueue_job(
            conn,
            job_type="RUN_AI_FOR_EVENT",
            dedupe_key=f"AI|{cik}|{owner_key}|{acc}|{cfg.PROMPT_VERSION}",
            payload={
                "issuer_cik": cik,
                "owner_key": owner_key,
                "accession_number": acc,
                "force": bool(payload.force),
            },
            priority=70,
            max_attempts=10,
            requeue_if_exists=True,
        )

    return {
        "enqueued": True,
        "event_key": {"issuer_cik": cik, "owner_key": owner_key, "accession_number": acc},
        "force": bool(payload.force),
    }
