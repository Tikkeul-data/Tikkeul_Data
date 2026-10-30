from tests.conftest import make_settings


def _signup(client, email="a@example.com", password="password123"):
    return client.post("/api/auth/signup", json={"email": email, "password": password})


def test_signup_then_me_returns_the_account(make_client):
    client = make_client(lambda r: None)
    res = _signup(client)
    assert res.status_code == 201
    body = res.json()
    assert body["user"]["email"] == "a@example.com"
    assert "password" not in body["user"] and "password_hash" not in body["user"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200 and me.json()["email"] == "a@example.com"


def test_signup_duplicate_email_is_409(make_client):
    client = make_client(lambda r: None)
    _signup(client)
    res = _signup(client)
    assert res.status_code == 409 and res.json()["error"]["code"] == "EMAIL_TAKEN"


def test_login_with_correct_password_succeeds(make_client):
    client = make_client(lambda r: None)
    _signup(client)
    res = client.post("/api/auth/login", json={"email": "a@example.com", "password": "password123"})
    assert res.status_code == 200 and "access_token" in res.json()


def test_login_wrong_password_and_unknown_email_both_401_invalid_credentials(make_client):
    client = make_client(lambda r: None)
    _signup(client)
    wrong = client.post("/api/auth/login", json={"email": "a@example.com", "password": "nope"})
    unknown = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "password123"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["code"] == unknown.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_me_without_token_is_401(make_client):
    client = make_client(lambda r: None)
    res = client.get("/api/auth/me")
    assert res.status_code == 401 and res.json()["error"]["code"] == "UNAUTHORIZED"


def test_me_with_garbage_token_is_401(make_client):
    client = make_client(lambda r: None)
    res = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert res.status_code == 401 and res.json()["error"]["code"] == "UNAUTHORIZED"


def test_signup_without_jwt_secret_is_503_not_configured(make_client):
    client = make_client(lambda r: None, settings=make_settings(jwt_secret=None))
    res = _signup(client)
    assert res.status_code == 503 and res.json()["error"]["code"] == "NOT_CONFIGURED"


def test_signup_rejects_malformed_email_with_422(make_client):
    client = make_client(lambda r: None)
    res = client.post("/api/auth/signup", json={"email": "not-an-email", "password": "password123"})
    assert res.status_code == 422


def test_signup_rejects_short_password_with_422(make_client):
    client = make_client(lambda r: None)
    res = client.post("/api/auth/signup", json={"email": "a@example.com", "password": "short"})
    assert res.status_code == 422


def test_signup_normalizes_email_case_so_duplicate_is_still_caught(make_client):
    client = make_client(lambda r: None)
    _signup(client, email="a@example.com")
    res = _signup(client, email="  A@Example.com ")
    assert res.status_code == 409


def test_signup_failure_after_user_insert_does_not_leave_a_half_created_account(make_client):
    # jwt_secret 이 없어 토큰 발급이 실패하면, 그 전에 DB 에 넣은 유저도 커밋되지 않아야 한다.
    # 안 그러면 나중에 jwt_secret 을 설정해도 같은 이메일로 재가입이 막히고(EMAIL_TAKEN),
    # 그 반쪽짜리 계정은 토큰을 받은 적이 없어 로그인도 못 한다.
    from sqlmodel import Session, select

    from app.auth.models import User

    client = make_client(lambda r: None, settings=make_settings(jwt_secret=None))
    failed = _signup(client)
    assert failed.status_code == 503

    with Session(client.app.state.db_engine) as session:
        assert session.exec(select(User).where(User.email == "a@example.com")).first() is None


def test_check_email_available_for_unused_email(make_client):
    client = make_client(lambda r: None)
    res = client.get("/api/auth/check-email", params={"email": "fresh@example.com"})
    assert res.status_code == 200 and res.json() == {"available": True}


def test_check_email_unavailable_after_signup(make_client):
    client = make_client(lambda r: None)
    _signup(client, email="taken@example.com")
    res = client.get("/api/auth/check-email", params={"email": "taken@example.com"})
    assert res.status_code == 200 and res.json() == {"available": False}


def test_check_email_normalizes_case_and_whitespace(make_client):
    client = make_client(lambda r: None)
    _signup(client, email="mixedcase@example.com")
    res = client.get("/api/auth/check-email", params={"email": "  MixedCase@Example.com "})
    assert res.status_code == 200 and res.json() == {"available": False}


def test_check_email_rejects_malformed_email_with_422(make_client):
    client = make_client(lambda r: None)
    res = client.get("/api/auth/check-email", params={"email": "not-an-email"})
    assert res.status_code == 422


def test_check_email_does_not_require_a_token(make_client):
    client = make_client(lambda r: None)
    res = client.get("/api/auth/check-email", params={"email": "anyone@example.com"})
    assert res.status_code == 200
