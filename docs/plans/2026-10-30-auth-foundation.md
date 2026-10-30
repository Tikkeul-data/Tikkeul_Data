# 로그인/DB 기반(Task ①: Auth Foundation) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, following the `test-driven-development` and `verification-before-completion` skills. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이 백엔드에 처음으로 영구 저장소(SQLite)와 이메일/비밀번호 로그인(JWT)을 추가한다. 즐겨찾기·최근목적지·자주가는경로(Task ②~④)가 공통으로 의존하는 기반만 다룬다 — 가입(`POST /api/auth/signup`)·로그인(`POST /api/auth/login`)·내 정보(`GET /api/auth/me`)와, 다른 라우터가 재사용할 `get_current_user` 의존성.

**Architecture:** `docs/AUTH_DESIGN.md`(architect 설계)를 그대로 따른다. SQLModel+SQLite, JWT(Bearer, PyJWT), bcrypt 해싱. 기존 `app/routers/traffic.py`가 쓰는 `get_service(request: Request)` 패턴을 그대로 모방해 `app/state.db_engine`·`app/state.settings`에 담고 `Depends`로 꺼내 쓴다. 기존 `app/speed_bumps.py`의 정적 SQLite(읽기 전용, `sqlite3` 직접 사용)와는 별개 파일이며 충돌하지 않는다.

**Tech Stack:** FastAPI, SQLModel 0.0.24(SQLAlchemy 2.0.55 포함), PyJWT 2.10.1, bcrypt 4.2.0, pytest(`backend/tests/`).

**Spec:** [docs/AUTH_DESIGN.md](../AUTH_DESIGN.md) 2~4절·6~7절, [docs/REQUIREMENTS.md](../REQUIREMENTS.md) F-12.

## Global Constraints

- DB 파일 경로는 기존 관례를 따른다: `backend/data/`(이미 `.gitignore`에 있고 `speed_bumps.db`가 쓰는 디렉터리)에 `tikkeul.db`로 둔다. AUTH_DESIGN.md가 예시로 든 `app/data/`가 아니라 `BACKEND_DIR / "data"`(기존 `speed_bumps.py`와 같은 상수)를 쓴다.
- `jwt_secret`은 다른 API 키들(`its_traffic_api_key` 등)과 같은 패턴을 따른다 — `Optional[SecretStr] = None`, 미설정이면 토큰 발급·검증 시점에 기존 `NOT_CONFIGURED` 오류를 그대로 재사용한다(새 오류 코드를 만들지 않는다). 앱이 부팅 때 죽지 않는다(기존 "키 없어도 서버는 뜬다" 원칙 유지).
- 비밀번호·토큰·이메일을 로그에 남기지 않는다(N-04, `app/main.py`가 이미 httpx 로그 레벨을 낮춘 것과 같은 원칙).
- 오류 응답은 기존 `app/errors.py`의 `{"error": {"code", "message"}}` 형식을 그대로 쓴다(FastAPI 기본 `{"detail": ...}` 형식을 새로 쓰지 않는다).
- 로그인 실패 시 "이메일이 없음"과 "비밀번호가 틀림"을 구분하지 않고 같은 오류(`INVALID_CREDENTIALS`, 401)로 응답한다(계정 존재 여부를 노출하지 않는다).
- `email-validator` 같은 새 의존성을 추가하지 않는다 — pydantic `EmailStr` 대신 `@` 포함 여부만 보는 가벼운 검증으로 충분하다(이 프로젝트 규모에 맞는 단순화).
- 테스트는 실제 DB 파일을 건드리지 않는다 — `tests/conftest.py`의 `make_settings`가 `database_url="sqlite:///:memory:"`를 기본으로 병합한다(`tests/fixtures.py`의 `KEYS`는 `/api/health`의 "configured" 목록과 집합 비교되는 다른 용도라 건드리지 않는다. `jwt_secret`은 `/api/health`가 실제로 보고하는 설정값이라 `KEYS`에 넣는다).
- `jwt_secret`도 다른 인증키들과 똑같이 **`.env.example`에 변수명만 적고(`JWT_SECRET=`), `render.yaml`에 `sync: false`로 선언하고, `tests/test_environment.py`의 `KEY_NAMES`와 `backend/app/main.py`의 `_KEY_NAMES`에 추가**한다 — 이 네 곳이 맞아야 하는 건 기존 관례이자 기존 테스트(`test_env_example_has_names_only`, `test_render_secret_keys_are_never_written_in_file`)가 강제한다. 이번 계획에서 빠졌던 걸 Task 1에 추가했다.
- 가입 시 이메일은 저장 전에 **정규화(`strip().lower()`)**한다 — 안 그러면 `A@x.com`과 `a@x.com`이 서로 다른 계정이 되고, SQLite unique 인덱스가 대소문자를 구분해 중복 가입 방지(`EMAIL_TAKEN`)가 깨진다.
- 비밀번호는 최소 8자, **최대 72바이트**(UTF-8 인코딩 기준)까지만 받는다 — bcrypt가 72바이트를 넘으면 뒤를 조용히 자르기 때문에, 그보다 긴 서로 다른 비밀번호가 앞부분만 같으면 같은 해시가 될 수 있다.
- `app/auth/router.py`의 핸들러는 **`def`로 선언한다(`async def` 아님)** — `docs/AUTH_DESIGN.md` 4절의 핵심 결정이다. bcrypt 해시(코스트 12, 요청당 수백ms 블로킹)를 `async def` 핸들러에서 돌리면 FastAPI 이벤트 루프 전체(다른 사용자의 ITS 조회 등)가 그 시간만큼 멎는다. `def`로 두면 FastAPI가 스레드풀에서 돌려 이벤트 루프를 막지 않는다.
- CORS `allow_methods`에 `PATCH`·`DELETE`를 추가하는 건 **이번 Task에서 하지 않는다** — 그건 아직 없는 즐겨찾기(Task ②)가 쓸 메서드다. 이번 Task는 GET/POST만 쓰므로 범위를 지킨다. Task ②를 시작할 때 추가할 것.
- **알려진 한계(지금 고치지 않음)**: 로그인에서 이메일이 존재하지 않으면 `verify_password`(bcrypt, 느림)를 아예 안 돌리고, 존재하면 돌린다. 이 응답 시간 차이로 "이 이메일이 가입돼 있는지"를 타이밍으로 추측할 수 있다(타이밍 사이드채널). 본문으로는 `INVALID_CREDENTIALS`만 주지만 타이밍까지는 안 가렸다는 뜻 — 7일 프로젝트 규모에서는 감수하고, 사용자 수가 늘면 이메일 존재 여부와 무관하게 항상 더미 해시 검증을 한 번 돌리는 식으로 고쳐야 한다.

## Review Focus

- 비밀번호 평문이 응답 어디에도(`/signup`·`/login`·`/me`) 담기지 않아야 한다 — `password_hash` 필드명이 그대로 응답에 노출되는 실수를 포함해서.
- 이메일 중복 가입 시 명확한 오류(409)를 줘야 한다 — 안 그러면 두 번째 가입자가 DB 제약 위반으로 500을 받는다.
- `Authorization` 헤더가 아예 없거나, `Bearer ` 접두사가 없거나, 토큰이 변조됐거나, 만료됐을 때 전부 401로 일관되게 처리돼야 한다 — 하나라도 500으로 새면 다른 라우터(즐겨찾기 등)에서 그대로 재사용할 때 터진다.
- `jwt_secret`이 설정되지 않은 환경에서 가입·로그인을 시도하면 500이 아니라 기존 `NOT_CONFIGURED`(503)로 응답해야 한다(기존 키 없는 API들과 동작이 같아야 함).
- SQLite `:memory:` 엔진을 쓰는 테스트에서, 같은 요청(가입 직후 로그인 등) 안에서 세션을 두 번 열어도 데이터가 사라지지 않아야 한다(StaticPool 없이 흔히 나는 "방금 넣은 데이터가 안 보임" 버그).

---

### Task 1: 설정 + DB 엔진(`app/db.py`)

**Files:**
- Modify: `backend/requirements.txt` — `sqlmodel==0.0.24`, `PyJWT==2.10.1`, `bcrypt==4.2.0` 추가
- Modify: `backend/app/config.py` — `Settings`에 `jwt_secret: Optional[SecretStr] = None`, `jwt_algorithm: str = "HS256"`, `jwt_expires_days: int = 14`, `database_url: str = f"sqlite:///{BACKEND_DIR / 'data' / 'tikkeul.db'}"` 추가
- Create: `backend/app/db.py`
- Modify: `backend/tests/conftest.py` — `make_settings`가 `AUTH_TEST_DEFAULTS`(`database_url: "sqlite:///:memory:"`)를 병합하도록 변경. **(계획 수정: 원래 `tests/fixtures.py`의 `KEYS`에 `database_url`·`jwt_secret`을 같이 넣으려 했으나, `KEYS`는 `test_its_relay_mode.py`가 `/api/health`의 `configured` 키 목록과 집합 비교하는 데도 쓰여서 깨졌다. `database_url`은 `conftest.py`에 분리하고, `jwt_secret`은 실제로 `/api/health`가 보고하는 설정값이라 `KEYS`에 정식으로 추가)**
- Modify: `backend/tests/fixtures.py` — `KEYS`에 `"jwt_secret": "test-jwt-secret-key"` 추가(다른 인증키들과 같은 자리)
- Modify: `backend/app/main.py` — `_KEY_NAMES`(`/api/health`가 보고하는 설정 목록)에 `"jwt_secret"` 추가
- Modify: `backend/.env.example` — `JWT_SECRET=`(변수명만) 추가
- Modify: `backend/tests/test_environment.py` — `KEY_NAMES`에 `"JWT_SECRET"` 추가(이게 `.env.example`·`render.yaml` 둘 다에 있어야 한다고 기존 테스트가 강제한다)
- Modify: `render.yaml` — `JWT_SECRET`을 다른 키들과 같은 자리에 `sync: false`로 추가, SQLite 영구 디스크 확인 필요 TBD 주석 추가
- Test: `backend/tests/test_db.py`

**Interfaces:**
- Produces: `make_engine(settings: Settings) -> Engine`(SQLAlchemy/SQLModel 엔진), `create_db_and_tables(engine: Engine) -> None` — Task 2·3이 그대로 쓴다. `Settings.database_url: str`, `Settings.jwt_secret/jwt_algorithm/jwt_expires_days` — Task 2가 그대로 쓴다.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_db.py
from typing import Optional

import pytest
from sqlmodel import Field, Session, SQLModel, select

from app.config import Settings
from app.db import create_db_and_tables, make_engine
from tests.conftest import make_settings


class _Thing(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str


def test_memory_engine_keeps_data_across_separate_sessions():
    engine = make_engine(make_settings(database_url="sqlite:///:memory:"))
    SQLModel.metadata.create_all(engine, tables=[_Thing.__table__])
    with Session(engine) as s1:
        s1.add(_Thing(name="a"))
        s1.commit()
    with Session(engine) as s2:
        assert s2.exec(select(_Thing)).first().name == "a"


def test_file_engine_creates_missing_parent_directory(tmp_path):
    db_path = tmp_path / "nested" / "test.db"
    engine = make_engine(make_settings(database_url=f"sqlite:///{db_path}"))
    create_db_and_tables(engine)
    assert db_path.exists()
```

(`_Thing`은 이 테스트만의 임시 테이블이다 — `app/auth/models.py`는 Task 2에서 만들어진다.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_db.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.db'`

- [ ] **Step 3: Implement**

`backend/requirements.txt`에 세 줄 추가(기존 핀 포맷 그대로, ASCII).

`backend/app/config.py`: import에 `SecretStr`는 이미 있음. `Settings` 클래스에 4개 필드 추가(다른 `its_*_api_key`들 바로 아래, 또는 파일 끝 CORS 설정 위).

`backend/app/db.py`:
```python
from pathlib import Path

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import Settings


def make_engine(settings: Settings):
    url = settings.database_url
    connect_args = {"check_same_thread": False}
    if ":memory:" in url:
        return create_engine(url, connect_args=connect_args, poolclass=StaticPool)
    path = Path(url.removeprefix("sqlite:///"))
    path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(url, connect_args=connect_args)


def create_db_and_tables(engine) -> None:
    SQLModel.metadata.create_all(engine)
```

`backend/tests/fixtures.py`의 `KEYS` dict에 두 줄 추가.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_db.py -v`
Expected: PASS

- [ ] **Step 5: Run full backend suite to verify no regression**

Run: `cd backend && .venv/bin/python -m pytest`
Expected: 기존 190개 전부 PASS(새 `KEYS` 항목이 다른 테스트에 영향 없어야 한다 — `make_settings()`를 쓰는 테스트들은 이 두 필드를 아예 참조하지 않는다)

- [ ] **Step 6: Propose the commit (do NOT run it without user approval)**

```bash
git add backend/requirements.txt backend/app/config.py backend/app/db.py backend/tests/fixtures.py backend/tests/test_db.py
git commit -m "feat(backend): SQLite+SQLModel 엔진과 JWT 설정 추가"
```

---

### Task 2: User 모델 + 비밀번호·토큰(`app/auth/security.py`)

**Files:**
- Create: `backend/app/auth/__init__.py`(빈 파일)
- Create: `backend/app/auth/models.py`
- Create: `backend/app/auth/security.py`
- Modify: `backend/app/errors.py` — `INVALID_CREDENTIALS`(401), `EMAIL_TAKEN`(409), `UNAUTHORIZED`(401) 추가
- Test: `backend/tests/test_auth_security.py`

**Interfaces:**
- Consumes: Task 1의 `Settings.jwt_secret/jwt_algorithm/jwt_expires_days`, `api_error`(`app/errors.py`, 기존)
- Produces: `User(SQLModel, table=True)`(`id`, `email`, `password_hash`, `created_at`), `UserPublic`, `SignupRequest`, `LoginRequest`, `TokenResponse`(모두 `app/auth/models.py`) — Task 3이 그대로 쓴다. `hash_password(password: str) -> str`, `verify_password(password: str, password_hash: str) -> bool`, `create_access_token(user_id: int, settings: Settings) -> str`, `decode_access_token(token: str, settings: Settings) -> int` — Task 3이 그대로 쓴다.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_auth_security.py
import time

import jwt
import pytest

from app.auth.security import create_access_token, decode_access_token, hash_password, verify_password
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
    with pytest.raises(ApiError):
        decode_access_token(token + "x", settings)


def test_access_token_rejects_expired_token():
    settings = make_settings(jwt_expires_days=1)
    # jwt_expires_days 를 기다리지 않고, 만료 시각을 과거로 둔 토큰을 직접 만든다
    import datetime
    secret = settings.secret("jwt_secret")
    expired = jwt.encode({"sub": "1", "exp": datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=1)}, secret, algorithm=settings.jwt_algorithm)
    with pytest.raises(ApiError):
        decode_access_token(expired, settings)


def test_token_functions_raise_not_configured_without_jwt_secret():
    settings = make_settings(jwt_secret=None)
    with pytest.raises(ApiError) as exc:
        create_access_token(1, settings)
    assert exc.value.code == "NOT_CONFIGURED"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth_security.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.auth'`

- [ ] **Step 3: Implement**

`backend/app/errors.py`의 `_ERRORS`에 추가:
```python
"INVALID_CREDENTIALS": (401, "이메일 또는 비밀번호가 올바르지 않습니다."),
"EMAIL_TAKEN": (409, "이미 가입된 이메일입니다."),
"UNAUTHORIZED": (401, "로그인이 필요합니다."),
```

**(계획 수정: `picky-team-lead-park` 리뷰로 `SignupRequest`/`LoginRequest`의 이메일 검증에 정규화(`strip().lower()`)를, 비밀번호 검증에 72바이트 상한을 추가했다. 실제 구현은 `app/auth/models.py`의 `_normalize_email`/`_validate_password` 참고 — 아래 코드 블록은 최초 설계 의도만 보여준다.)**

`backend/app/auth/models.py`:
```python
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


class SignupRequest(SQLModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _email_has_at(cls, v: str) -> str:
        if "@" not in v or len(v) < 3:
            raise ValueError("올바른 이메일 형식이 아닙니다.")
        return v

    @field_validator("password")
    @classmethod
    def _password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("비밀번호는 8자 이상이어야 합니다.")
        return v


class LoginRequest(SQLModel):
    email: str
    password: str


class UserPublic(SQLModel):
    id: int
    email: str
    created_at: datetime


class TokenResponse(SQLModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
```

`backend/app/auth/security.py`: 위 테스트가 요구하는 4개 함수. `bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())` / `bcrypt.checkpw(...)`. `jwt.encode({"sub": str(user_id), "exp": ...}, secret, algorithm=...)` / `jwt.decode(token, secret, algorithms=[settings.jwt_algorithm])`을 `try/except jwt.PyJWTError`로 감싸 `api_error("INVALID_CREDENTIALS")`가 아니라 **`api_error("UNAUTHORIZED")`**로 변환한다(로그인 실패와 토큰 무효는 다른 오류). `settings.secret("jwt_secret")`이 `None`이면 두 함수 모두 즉시 `api_error("NOT_CONFIGURED")`를 던진다.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth_security.py -v`
Expected: PASS

- [ ] **Step 5: Propose the commit (do NOT run it without user approval)**

```bash
git add backend/app/errors.py backend/app/auth/__init__.py backend/app/auth/models.py backend/app/auth/security.py backend/tests/test_auth_security.py
git commit -m "feat(backend): User 모델과 비밀번호 해싱·JWT 발급/검증 추가"
```

---

### Task 3: 라우터(`/api/auth/*`) + `get_current_user` + 배선

**Files:**
- Create: `backend/app/auth/deps.py`
- Create: `backend/app/auth/router.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_auth_api.py`

**Interfaces:**
- Consumes: Task 1의 `make_engine`/`create_db_and_tables`, Task 2의 `User`/`SignupRequest`/`LoginRequest`/`TokenResponse`/`UserPublic`/`hash_password`/`verify_password`/`create_access_token`/`decode_access_token`
- Produces: `get_current_user(request: Request, authorization: Optional[str] = Header(default=None)) -> User` — Task ②(즐겨찾기)·Task ③(최근목적지)이 자기 라우터에서 `Depends(get_current_user)`로 그대로 가져다 쓴다. `router`(`APIRouter(prefix="/api/auth")`) — `main.py`가 등록한다.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_auth_api.py
from tests.conftest import make_client


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
    from tests.conftest import make_settings

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth_api.py -v`
Expected: FAIL — `404`(라우터가 아직 등록 안 됨) 또는 `ModuleNotFoundError`

- [ ] **Step 3: Implement**

`backend/app/auth/deps.py`:
```python
from typing import Optional

from fastapi import Header, Request
from sqlmodel import Session

from app.auth.models import User
from app.auth.security import decode_access_token
from app.errors import api_error


def get_current_user(request: Request, authorization: Optional[str] = Header(default=None)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise api_error("UNAUTHORIZED")
    token = authorization.removeprefix("Bearer ").strip()
    user_id = decode_access_token(token, request.app.state.settings)
    with Session(request.app.state.db_engine) as session:
        user = session.get(User, user_id)
    if user is None:
        raise api_error("UNAUTHORIZED")
    return user
```

`backend/app/auth/router.py`: `router = APIRouter(prefix="/api/auth", tags=["auth"])`. **모든 핸들러는 `def`로 선언한다(`async def` 아님)** — `docs/AUTH_DESIGN.md` 4절: bcrypt(코스트 12, 요청당 수백ms)를 `async def` 안에서 돌리면 FastAPI 이벤트 루프를 그만큼 막는다. `def`로 두면 FastAPI가 스레드풀에서 돌린다.
- `POST /signup`(`response_model=TokenResponse`, `status_code=201`): `Session(request.app.state.db_engine)`로 이메일 중복 조회(`select(User).where(User.email == body.email)` — `body.email`은 이미 `SignupRequest`의 `field_validator`가 정규화한 값) → 있으면 `api_error("EMAIL_TAKEN")` → 없으면 `User(email=..., password_hash=hash_password(body.password))` 추가·커밋 → `create_access_token` → `TokenResponse`.
  - shortcut: 이메일 중복 검사와 삽입 사이에 동시 가입 레이스 컨디션이 있을 수 있다(두 요청이 거의 동시에 들어오면 유니크 제약 위반으로 500). 이 프로젝트 사용자 규모에서는 무시 가능한 리스크로 보고 넘어간다. 늘어나면 `email`의 DB 유니크 제약 위반을 잡아 409로 바꾸는 방식으로 올려야 한다.
- `POST /login`(`response_model=TokenResponse`): 이메일로 조회(`body.email`도 정규화된 값) → 없거나 `verify_password` 실패 → `api_error("INVALID_CREDENTIALS")`(두 경우 구분 없이 같은 메시지 — 단, 타이밍 사이드채널은 Global Constraints에 적은 대로 이번엔 안 고친다) → 성공하면 `create_access_token` → `TokenResponse`.
- `GET /me`(`response_model=UserPublic`, `Depends(get_current_user)`): 받은 `User`를 그대로 `UserPublic`으로 반환.

`backend/app/main.py`:
- import 추가: `from app.auth.router import router as auth_router`, `from app.db import create_db_and_tables, make_engine`.
- `lifespan` 안에서 `client` 생성 다음 줄에: `engine = make_engine(settings); create_db_and_tables(engine); app.state.db_engine = engine; app.state.settings = settings`.
- `app.include_router(auth_router)` 추가.
- CORS `allow_methods`는 **건드리지 않는다**(GET/POST로 충분 — PATCH/DELETE는 즐겨찾기 Task에서 그 라우터와 함께 추가한다. Surgical Changes: 안 쓰는 메서드를 미리 열어두지 않는다).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth_api.py -v`
Expected: PASS

- [ ] **Step 5: Run full backend suite + manual smoke check**

Run: `cd backend && .venv/bin/python -m pytest`
Expected: 전부 PASS(Task 1·2까지 199개 + 이번에 추가된 테스트)

Run: `cd backend && .venv/bin/uvicorn app.main:app --reload` 로 띄운 뒤 `curl -X POST localhost:8000/api/auth/signup -H "Content-Type: application/json" -d '{"email":"t@t.com","password":"password123"}'`로 실제 `backend/data/tikkeul.db` 파일이 생기는지 확인(이 파일은 `.gitignore`에 이미 있어 커밋되지 않는다).

**(이 수동 확인으로 실제 버그를 하나 더 찾았다: `session.commit()`이 `create_access_token()`보다 먼저 있어서, `jwt_secret` 미설정으로 토큰 발급이 실패해도 User 는 이미 커밋돼 있었다 — 클라이언트는 503을 받지만 "반쪽짜리 계정"이 DB에 남아, `jwt_secret`을 나중에 설정해도 같은 이메일로 재가입이 `EMAIL_TAKEN`으로 막히고 그 계정은 토큰을 받은 적이 없어 로그인도 못 했다. `session.add(user); session.flush()`로 id만 받고, `create_access_token` 성공 뒤에 `session.commit()`하도록 순서를 바꿔 고쳤다. 회귀 테스트 `test_signup_failure_after_user_insert_does_not_leave_a_half_created_account` 추가. 이 테스트는 `test-driven-development` 절차로 먼저 실패를 확인한 뒤 고쳤다.)**

- [ ] **Step 6: Propose the commit (do NOT run it without user approval)**

```bash
git add backend/app/auth/deps.py backend/app/auth/router.py backend/app/main.py backend/tests/test_auth_api.py
git commit -m "feat(backend): /api/auth 가입·로그인·내정보 엔드포인트 추가"
```
