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
    return jwt.encode({"sub": str(user_id), "purpose": "access", "exp": expires_at}, secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str, settings: Settings) -> int:
    # purpose 를 확인해서 이메일 인증 토큰(create_email_verify_token)이 로그인 토큰으로 재사용되는 걸 막는다.
    # 인증 메일은 노출 경로가 더 많다(메일함·클라이언트 기록 등) - 거기서 샌 토큰이 로그인에 쓰이면 안 된다.
    secret = _require_secret(settings)
    try:
        payload = jwt.decode(token, secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise api_error("UNAUTHORIZED")
    if payload.get("purpose") != "access":
        raise api_error("UNAUTHORIZED")
    return int(payload["sub"])


def create_email_verify_token(user_id: int, settings: Settings) -> str:
    secret = _require_secret(settings)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.email_verify_expires_hours)
    return jwt.encode({"sub": str(user_id), "purpose": "verify_email", "exp": expires_at}, secret, algorithm=settings.jwt_algorithm)


def decode_email_verify_token(token: str, settings: Settings) -> int:
    secret = _require_secret(settings)
    try:
        payload = jwt.decode(token, secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise api_error("UNAUTHORIZED")
    if payload.get("purpose") != "verify_email":
        raise api_error("UNAUTHORIZED")
    return int(payload["sub"])
