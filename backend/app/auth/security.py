from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import Settings
from app.errors import api_error


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def _require_secret(settings: Settings) -> str:
    secret = settings.secret("jwt_secret")
    if secret is None:
        raise api_error("NOT_CONFIGURED")
    return secret


def create_access_token(user_id: int, settings: Settings) -> str:
    secret = _require_secret(settings)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expires_days)
    return jwt.encode({"sub": str(user_id), "exp": expires_at}, secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str, settings: Settings) -> int:
    secret = _require_secret(settings)
    try:
        payload = jwt.decode(token, secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise api_error("UNAUTHORIZED")
    return int(payload["sub"])
