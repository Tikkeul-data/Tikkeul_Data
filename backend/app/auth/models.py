from datetime import datetime, timezone
from typing import Optional

from pydantic import field_validator
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=_utcnow)


def _normalize_email(v: str) -> str:
    v = v.strip().lower()
    if "@" not in v or len(v) < 3:
        raise ValueError("올바른 이메일 형식이 아닙니다.")
    return v


# bcrypt 는 비밀번호를 72바이트까지만 본다(그 뒤는 조용히 잘린다) - 72바이트를 넘는 서로 다른 비밀번호가
# 앞부분만 같으면 같은 해시가 될 수 있어, 그 전에 막는다. 글자 수가 아니라 UTF-8 바이트 수로 잰다.
_PASSWORD_MAX_BYTES = 72


def _validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("비밀번호는 8자 이상이어야 합니다.")
    if len(v.encode("utf-8")) > _PASSWORD_MAX_BYTES:
        raise ValueError(f"비밀번호는 {_PASSWORD_MAX_BYTES}바이트를 넘을 수 없습니다.")
    return v


class SignupRequest(SQLModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return _normalize_email(v)

    @field_validator("password")
    @classmethod
    def _check_password(cls, v: str) -> str:
        return _validate_password(v)


class LoginRequest(SQLModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return _normalize_email(v)


class UserPublic(SQLModel):
    id: int
    email: str
    created_at: datetime


class TokenResponse(SQLModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
