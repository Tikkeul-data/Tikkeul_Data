import datetime

import jwt
import pytest

from app.auth.security import (
    create_access_token,
    create_email_verify_token,
    decode_access_token,
    decode_email_verify_token,
    hash_password,
    verify_password,
)
from app.errors import ApiError
from tests.conftest import make_settings


def test_hash_password_is_not_the_plain_password_and_verifies_correctly():
    h = hash_password("hunter2")
    assert h != "hunter2"
    assert verify_password("hunter2", h) is True
    assert verify_password("wrong", h) is False


def test_access_token_round_trips_user_id():
    settings = make_settings()
    token = create_access_token(42, settings)
    assert decode_access_token(token, settings) == 42


def test_access_token_rejects_tampered_token():
    settings = make_settings()
    token = create_access_token(1, settings)
    with pytest.raises(ApiError) as exc:
        decode_access_token(token + "x", settings)
    assert exc.value.code == "UNAUTHORIZED"


def test_access_token_rejects_expired_token():
    settings = make_settings()
    secret = settings.secret("jwt_secret")
    expired = jwt.encode(
        {"sub": "1", "exp": datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=1)},
        secret,
        algorithm=settings.jwt_algorithm,
    )
    with pytest.raises(ApiError) as exc:
        decode_access_token(expired, settings)
    assert exc.value.code == "UNAUTHORIZED"


def test_token_functions_raise_not_configured_without_jwt_secret():
    settings = make_settings(jwt_secret=None)
    with pytest.raises(ApiError) as exc:
        create_access_token(1, settings)
    assert exc.value.code == "NOT_CONFIGURED"
    with pytest.raises(ApiError) as exc2:
        decode_access_token("whatever", settings)
    assert exc2.value.code == "NOT_CONFIGURED"


def test_signup_request_normalizes_email_and_checks_password_length():
    from app.auth.models import SignupRequest

    req = SignupRequest(email="  A@Example.com ", password="password123")
    assert req.email == "a@example.com"
    with pytest.raises(Exception):
        SignupRequest(email="a@example.com", password="short")
    with pytest.raises(Exception):
        SignupRequest(email="a@example.com", password="x" * 100)


def test_login_request_normalizes_email_too():
    from app.auth.models import LoginRequest

    assert LoginRequest(email=" A@Example.com", password="whatever").email == "a@example.com"


def test_email_verify_token_round_trips_user_id():
    settings = make_settings()
    token = create_email_verify_token(7, settings)
    assert decode_email_verify_token(token, settings) == 7


def test_access_token_cannot_be_used_as_email_verify_token():
    settings = make_settings()
    access = create_access_token(1, settings)
    with pytest.raises(ApiError) as exc:
        decode_email_verify_token(access, settings)
    assert exc.value.code == "UNAUTHORIZED"


def test_email_verify_token_cannot_be_used_as_access_token():
    settings = make_settings()
    verify = create_email_verify_token(1, settings)
    with pytest.raises(ApiError) as exc:
        decode_access_token(verify, settings)
    assert exc.value.code == "UNAUTHORIZED"
