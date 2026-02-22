from __future__ import annotations

from typing import Any, Dict, Optional

from insider_platform.config import Config
from insider_platform.db import connect
from insider_platform.util.time import utcnow_iso

from .security import hash_password, verify_password


def normalize_username(username: str) -> str:
    return (username or "").strip().lower()


def public_user(row: Any | Dict[str, Any]) -> Dict[str, Any]:
    d = dict(row)
    d.pop("password_hash", None)
    # Convenience flag used by the frontend for gating.
    status = (d.get("subscription_status") or "").strip().lower()
    d["is_paid"] = status in ("active", "trialing")
    return d


def get_user_by_stripe_customer_id(conn: Any, stripe_customer_id: str) -> Optional[Any]:
    cid = (stripe_customer_id or "").strip()
    if not cid:
        return None
    return conn.execute(
        "SELECT * FROM users WHERE stripe_customer_id=?",
        (cid,),
    ).fetchone()


def update_user_subscription(
    conn: Any,
    *,
    user_id: int,
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
    stripe_price_id: str | None = None,
    subscription_status: str | None = None,
    current_period_end: str | None = None,
    cancel_at_period_end: bool | None = None,
) -> None:
    """Persist Stripe subscription state onto the user row."""
    now = utcnow_iso()
    # Build dynamic SQL so we only touch provided fields.
    fields: list[tuple[str, Any]] = []
    if stripe_customer_id is not None:
        fields.append(("stripe_customer_id", stripe_customer_id))
    if stripe_subscription_id is not None:
        fields.append(("stripe_subscription_id", stripe_subscription_id))
    if stripe_price_id is not None:
        fields.append(("stripe_price_id", stripe_price_id))
    if subscription_status is not None:
        fields.append(("subscription_status", subscription_status))
    if current_period_end is not None:
        fields.append(("current_period_end", current_period_end))
    if cancel_at_period_end is not None:
        fields.append(("cancel_at_period_end", 1 if cancel_at_period_end else 0))

    # Always update timestamps if we touched anything.
    if not fields:
        return

    fields.append(("subscription_updated_at", now))
    fields.append(("updated_at", now))

    sets = ", ".join([f"{k}=?" for k, _ in fields])
    params = [v for _, v in fields] + [int(user_id)]
    conn.execute(
        f"UPDATE users SET {sets} WHERE user_id=?",
        params,
    )


def get_user_by_username(conn: Any, username: str) -> Optional[Any]:
    u = normalize_username(username)
    if not u:
        return None
    return conn.execute(
        "SELECT * FROM users WHERE username=?",
        (u,),
    ).fetchone()


def get_user_by_id(conn: Any, user_id: int) -> Optional[Any]:
    return conn.execute(
        "SELECT * FROM users WHERE user_id=?",
        (int(user_id),),
    ).fetchone()


def verify_user_credentials(conn: Any, username: str, password: str) -> Optional[Any]:
    row = get_user_by_username(conn, username)
    if row is None:
        return None
    if int(row["is_active"] or 0) != 1:
        return None
    if not verify_password(password, str(row["password_hash"])):
        return None
    return row


def create_user(
    conn: Any,
    *,
    username: str,
    password: str,
    role: str = "user",
    is_active: bool = True,
) -> Dict[str, Any]:
    u = normalize_username(username)
    if not u:
        raise ValueError("username_blank")
    if role not in ("admin", "user"):
        raise ValueError("invalid_role")

    # Use the normalized username for uniqueness checks.
    existing = conn.execute("SELECT 1 FROM users WHERE username=?", (u,)).fetchone()
    if existing is not None:
        raise ValueError("username_exists")

    now = utcnow_iso()
    conn.execute(
        """
        INSERT INTO users (username, password_hash, role, is_active, created_at, updated_at)
        VALUES (?,?,?,?,?,?)
        """,
        (u, hash_password(password), role, 1 if is_active else 0, now, now),
    )
    row = get_user_by_username(conn, u)
    assert row is not None
    return public_user(row)


def touch_last_login(conn: Any, user_id: int) -> None:
    now = utcnow_iso()
    conn.execute(
        "UPDATE users SET last_login_at=?, updated_at=? WHERE user_id=?",
        (now, now, int(user_id)),
    )


def bootstrap_admin_if_needed(cfg: Config) -> Optional[Dict[str, Any]]:
    """Create the first admin user if the users table is empty.

    Controlled via environment variables so a new clone has a deterministic way to log in.

    - AUTH_BOOTSTRAP_ADMIN_USERNAME (default: admin)
    - AUTH_BOOTSTRAP_ADMIN_PASSWORD (default: admin)

    This only runs when there are 0 rows in `users`.
    """

    with connect(cfg.DB_DSN) as conn:
        n = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
        if int(n) > 0:
            return None

        username = normalize_username(getattr(cfg, "AUTH_BOOTSTRAP_ADMIN_USERNAME", "") or "admin")
        password = getattr(cfg, "AUTH_BOOTSTRAP_ADMIN_PASSWORD", None) or "admin"

        # If env explicitly clears these, don't create anything.
        if not username or not password:
            return None

        # Create admin
        u = create_user(conn, username=username, password=password, role="admin")
        return u
