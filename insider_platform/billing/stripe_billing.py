from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from insider_platform.config import Config
from insider_platform.db import connect
from insider_platform.util.time import utcnow_iso

from insider_platform.auth.crud import get_user_by_id, get_user_by_stripe_customer_id, update_user_subscription


def _ts_to_iso(ts: int | float | None) -> Optional[str]:
    if ts is None:
        return None
    try:
        dt = datetime.fromtimestamp(float(ts), tz=timezone.utc)
        # Keep the project convention: ISO-8601 with trailing Z
        return dt.isoformat().replace("+00:00", "Z")
    except Exception:
        return None


def _get_stripe(cfg: Config):
    try:
        import stripe  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "Stripe selected but the 'stripe' package is not installed. Install stripe and try again."
        ) from e

    if not cfg.STRIPE_SECRET_KEY:
        raise RuntimeError("stripe_secret_key_missing")

    stripe.api_key = cfg.STRIPE_SECRET_KEY
    return stripe


def create_checkout_session(
    cfg: Config,
    *,
    user_id: int,
    price_id: str,
    success_url: str,
    cancel_url: str,
    customer_id: str | None = None,
    customer_email: str | None = None,
) -> str:
    """Create a Stripe Checkout Session URL for a subscription."""
    stripe = _get_stripe(cfg)

    # Prefer attaching the Checkout to an existing customer.
    params: Dict[str, Any] = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "allow_promotion_codes": True,
        # Helps us map webhooks back to users.
        "client_reference_id": str(user_id),
        "metadata": {"user_id": str(user_id)},
    }

    if customer_id:
        params["customer"] = customer_id
    elif customer_email:
        # Checkout will create a customer automatically.
        params["customer_email"] = customer_email

    session = stripe.checkout.Session.create(**params)
    url = session.get("url")
    if not url:
        raise RuntimeError("stripe_session_url_missing")
    return str(url)


def create_billing_portal_session(cfg: Config, *, customer_id: str, return_url: str) -> str:
    stripe = _get_stripe(cfg)
    session = stripe.billing_portal.Session.create(customer=customer_id, return_url=return_url)
    url = session.get("url")
    if not url:
        raise RuntimeError("stripe_portal_url_missing")
    return str(url)


def process_stripe_webhook(
    cfg: Config,
    *,
    payload_bytes: bytes,
    signature: str | None,
) -> Tuple[str, bool]:
    """Verify + process a Stripe webhook.

    Returns: (event_id, processed)
    """
    stripe = _get_stripe(cfg)
    if not cfg.STRIPE_WEBHOOK_SECRET:
        raise RuntimeError("stripe_webhook_secret_missing")

    if not signature:
        raise RuntimeError("stripe_signature_missing")

    event = stripe.Webhook.construct_event(payload_bytes, signature, cfg.STRIPE_WEBHOOK_SECRET)
    event_id = str(event.get("id") or "")
    event_type = str(event.get("type") or "")

    # Idempotency: record the event_id first; if we've seen it, exit early.
    with connect(cfg.DB_DSN) as conn:
        existing = conn.execute("SELECT 1 FROM stripe_events WHERE event_id=?", (event_id,)).fetchone()
        if existing is not None:
            return event_id, False
        conn.execute(
            "INSERT INTO stripe_events (event_id, event_type, received_at) VALUES (?,?,?)",
            (event_id, event_type, utcnow_iso()),
        )

    # Handle event types
    # If handler code raises, delete the idempotency row so Stripe retries can re-process.
    try:
        if event_type == "checkout.session.completed":
            _handle_checkout_completed(cfg, stripe, event)
        elif event_type.startswith("customer.subscription."):
            _handle_subscription_event(cfg, stripe, event)
        elif event_type.startswith("invoice."):
            _handle_invoice_event(cfg, stripe, event)
        # else: ignore other events
    except Exception:
        # Best-effort: remove the idempotency record so Stripe can retry.
        try:
            with connect(cfg.DB_DSN) as conn:
                conn.execute("DELETE FROM stripe_events WHERE event_id=?", (event_id,))
        except Exception:
            pass
        raise

    return event_id, True


def _handle_checkout_completed(cfg: Config, stripe: Any, event: Dict[str, Any]) -> None:
    session = event.get("data", {}).get("object", {})

    user_id_raw = session.get("client_reference_id") or (session.get("metadata") or {}).get("user_id")
    try:
        user_id = int(user_id_raw)
    except Exception:
        user_id = 0

    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    # Fetch subscription details for status / period end.
    sub = None
    try:
        if subscription_id:
            sub = stripe.Subscription.retrieve(subscription_id)
    except Exception:
        sub = None

    status = None
    current_period_end = None
    cancel_at_period_end = None
    price_id = None

    if sub:
        status = (sub.get("status") or None)
        current_period_end = _ts_to_iso(sub.get("current_period_end"))
        cancel_at_period_end = bool(sub.get("cancel_at_period_end"))
        # Derive price from first item
        try:
            items = sub.get("items", {}).get("data", [])
            if items and isinstance(items, list):
                price_id = items[0].get("price", {}).get("id")
        except Exception:
            price_id = None

    if user_id <= 0:
        # Best-effort fallback: map by customer id.
        if customer_id:
            with connect(cfg.DB_DSN) as conn:
                row = get_user_by_stripe_customer_id(conn, str(customer_id))
                if row is not None:
                    user_id = int(row["user_id"])

    if user_id <= 0:
        print("[billing] checkout.session.completed: could not map to user")
        return

    with connect(cfg.DB_DSN) as conn:
        # Ensure user exists
        if get_user_by_id(conn, user_id) is None:
            print(f"[billing] checkout.session.completed: user_id not found: {user_id}")
            return
        update_user_subscription(
            conn,
            user_id=user_id,
            stripe_customer_id=str(customer_id) if customer_id else None,
            stripe_subscription_id=str(subscription_id) if subscription_id else None,
            stripe_price_id=str(price_id) if price_id else None,
            subscription_status=str(status) if status else None,
            current_period_end=current_period_end,
            cancel_at_period_end=cancel_at_period_end,
        )


def _handle_subscription_event(cfg: Config, stripe: Any, event: Dict[str, Any]) -> None:
    sub = event.get("data", {}).get("object", {})
    customer_id = sub.get("customer")
    subscription_id = sub.get("id")
    status = sub.get("status")
    current_period_end = _ts_to_iso(sub.get("current_period_end"))
    cancel_at_period_end = bool(sub.get("cancel_at_period_end"))

    price_id = None
    try:
        items = sub.get("items", {}).get("data", [])
        if items and isinstance(items, list):
            price_id = items[0].get("price", {}).get("id")
    except Exception:
        price_id = None

    if not customer_id:
        return

    with connect(cfg.DB_DSN) as conn:
        user = get_user_by_stripe_customer_id(conn, str(customer_id))
        if user is None:
            return
        update_user_subscription(
            conn,
            user_id=int(user["user_id"]),
            stripe_customer_id=str(customer_id),
            stripe_subscription_id=str(subscription_id) if subscription_id else None,
            stripe_price_id=str(price_id) if price_id else None,
            subscription_status=str(status) if status else None,
            current_period_end=current_period_end,
            cancel_at_period_end=cancel_at_period_end,
        )


def _handle_invoice_event(cfg: Config, stripe: Any, event: Dict[str, Any]) -> None:
    # We currently rely on subscription events for state. Invoice events can be used
    # later for richer UX (failed payments messaging).
    return
