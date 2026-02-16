from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt
from passlib.context import CryptContext


_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
_JWT_ALG = "HS256"


def hash_password(password: str) -> str:
    if not password:
        raise ValueError("password_blank")
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    if not password or not password_hash:
        return False
    try:
        return _pwd.verify(password, password_hash)
    except Exception:
        return False


def create_access_token(
    *,
    secret: str,
    user_id: int,
    username: str,
    role: str,
    expires_minutes: int,
) -> str:
    if not secret:
        raise ValueError("jwt_secret_blank")

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=max(1, int(expires_minutes)))

    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=_JWT_ALG)


def decode_access_token(*, token: str, secret: str) -> Dict[str, Any]:
    if not token:
        raise ValueError("token_blank")
    if not secret:
        raise ValueError("jwt_secret_blank")
    return jwt.decode(token, secret, algorithms=[_JWT_ALG])
