"""Authentication / authorization helpers.

This project intentionally keeps auth lightweight:

- Users table (username/password hash + role)
- JWT access tokens

The API supports both:

- `Authorization: Bearer <token>` (useful for scripts / API clients)
- A secure httpOnly cookie (set by `/auth/login` and `/auth/register`)

This allows the frontend to be a static SPA (Vite/React) without needing
a framework-specific server-side proxy.
"""

from .deps import get_current_user, require_admin, require_subscription
from .crud import bootstrap_admin_if_needed, create_user

__all__ = [
    "get_current_user",
    "require_admin",
    "require_subscription",
    "bootstrap_admin_if_needed",
    "create_user",
]
