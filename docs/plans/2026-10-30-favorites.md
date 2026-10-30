# 즐겨찾기(Task ②: Favorites CRUD) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, following the `test-driven-development` and `verification-before-completion` skills. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 사용자가 집/회사/커스텀 장소를 등록·수정·삭제하고 목록을 조회할 수 있는 백엔드 API(`/api/favorites/*`)를 만든다. `feat/auth-foundation`(`get_current_user`, `User`, DB 엔진)에 의존한다.

**Architecture:** `docs/AUTH_DESIGN.md` 6~7절의 Task ②. 기존 `app/auth/` 패턴(모델+보안 분리 대신, 여기선 모델+라우터만 있으면 충분 — CRUD에 별도 "보안" 모듈이 필요 없다)과 `app/auth/router.py`의 라우터 구조(`Session(request.app.state.db_engine)`, `Depends(get_current_user)`, `def` 핸들러)를 그대로 재사용한다. 새 테이블 `FavoritePlace`는 `User`를 외래키로 참조한다.

**Tech Stack:** FastAPI, SQLModel(기존 엔진 재사용, 새 마이그레이션 도구 없음 — `create_db_and_tables`가 기동 시 새 테이블도 같이 만든다), pytest.

**Spec:** [docs/AUTH_DESIGN.md](../AUTH_DESIGN.md) 5-2절·7절(즐겨찾기 행), [docs/REQUIREMENTS.md](../REQUIREMENTS.md) F-13.

## Global Constraints

- CORS `allow_methods`에 `PATCH`·`DELETE`를 추가한다 — `feat/auth-foundation` 계획에서 "즐겨찾기 Task에서 그 라우터와 함께 추가"하기로 미뤄둔 부분이다(Surgical Changes: 안 쓸 때는 안 열어 둔다).
- 집(`home`)·회사(`work`)는 사용자당 하나만 허용한다. **DB 제약이 아니라 애플리케이션 로직으로 검사한다**(AUTH_DESIGN.md 5-2절 결정) — 이미 있으면 생성은 409, 수정은 그 즐겨찾기 자체를 바꾸는 PATCH로 한다. `custom`은 개수 제한이 없다.
- 다른 사용자의 즐겨찾기는 **조회·수정·삭제 모두 404로 응답한다**(403이 아니다) — 그 id가 존재하는지 자체를 노출하지 않는다. 기존 로그인 실패(`INVALID_CREDENTIALS`가 이메일 존재 여부를 구분하지 않는 것)와 같은 근거.
- 라우터 핸들러는 `def`로 선언한다(`async def` 아님) — `app/auth/router.py`와 같은 이유(동기 `Session`은 블로킹 I/O라 이벤트 루프를 막을 수 있다. bcrypt만큼 느리진 않지만 같은 패턴을 지킨다).
- 위도·경도는 기존 `app/navigation/schemas.py`의 `LatLng`와 같은 범위로 검증한다(`lat: -90~90`, `lon: -180~180`).
- 필드 이름은 `lat`/`lon`을 쓴다(`lng`가 아니다) — `app/navigation/schemas.py`의 `LatLng`는 `lng`를 쓰지만, `app/models.py`의 `GeoPoint`(교통·보호구역 등 "장소" 도메인 전반)는 이미 `lon`을 쓴다. 즐겨찾기는 경로가 아니라 "장소"라 `GeoPoint` 쪽 관례를 따른다(이 백엔드에 이미 있던 불일치이지, 이번에 새로 만드는 게 아니다).
- PATCH 바디에 명시적으로 `null`이 와도(예: `{"lat": null}`) 그 필드는 **무시한다**(안 바뀐 것으로 취급) — `FavoritePlace`의 모든 필드는 null을 허용하지 않으므로, `exclude_unset=True`만 쓰면 명시적 null이 그대로 `setattr`에 들어가 커밋 시점에 처리 안 된 DB 오류(500)가 난다.
- 집/회사 중복 검사는 "생성/수정 전 SELECT로 미리 확인"만으로는 동시 요청 레이스(같은 사용자가 "집 등록"을 두 번 빠르게 누르는 것처럼 실제로 일어날 수 있는 상황)를 못 막는다. **DB에 부분 유니크 인덱스**(`(user_id, kind)`, `kind != 'custom'`일 때만)를 추가하고, 커밋 시 `IntegrityError`가 나면 롤백 후 `FAVORITE_KIND_TAKEN`으로 바꿔 응답한다. 사전 SELECT 검사는 그대로 두되(대부분의 경우 더 빠르고 친절한 오류), 레이스에 대한 안전망으로 DB 제약을 추가로 둔다.
- 새 백엔드 테이블 추가일 뿐, 프런트엔드 화면은 이번 계획에 없다(로그인 화면 자체가 아직 없다 — Task ②는 API까지만).

## Review Focus

- `kind='home'`으로 이미 하나 있는데 또 `home`을 만들려고 하면 409 — 안 그러면 "집"이 여러 개 생겨 프런트에서 어떤 걸 써야 할지 모호해진다.
- `custom`은 여러 개 만들 수 있어야 한다(위 제약이 `home`·`work`에만 걸려야 한다).
- 사용자 A의 토큰으로 사용자 B의 즐겨찾기 id를 PATCH/DELETE 시도하면 404 — 403이면 "그 id가 존재는 한다"는 걸 알려주게 된다.
- PATCH로 `kind`를 `custom`→`home`으로 바꿀 때, 이미 다른 `home`이 있으면 409가 떠야 한다(생성 때만 검사하고 수정 때는 빠뜨리기 쉬운 지점).
- 인증 없이(토큰 없음) 4개 엔드포인트 전부 401이어야 한다 — 하나라도 빠지면 그 엔드포인트만 로그인 없이 쓸 수 있게 된다.
- PATCH 바디에 `{"lat": null}`처럼 명시적 null을 보내면 500이 아니라 그 필드가 그대로 유지돼야 한다.
- 빈 PATCH 바디(`{}`)는 아무것도 안 바꾸고 기존 값 그대로 돌려줘야 한다.

---

### Task 1: `FavoritePlace` 모델 + CRUD 라우터 + CORS

**Files:**
- Create: `backend/app/favorites/__init__.py`(빈 파일)
- Create: `backend/app/favorites/models.py`
- Create: `backend/app/favorites/router.py`
- Modify: `backend/app/errors.py` — `FAVORITE_NOT_FOUND`(404), `FAVORITE_KIND_TAKEN`(409) 추가
- Modify: `backend/app/main.py` — `auth_router`처럼 `favorites_router` 등록, CORS `allow_methods`에 `PATCH`·`DELETE` 추가
- Test: `backend/tests/test_favorites_api.py`

**Interfaces:**
- Consumes: `feat/auth-foundation`의 `User`, `get_current_user`(`app/auth/deps.py`), `app.state.db_engine`(`app/main.py` lifespan, 이미 있음)
- Produces: 없음(이 기능의 최종 소비 지점 — 프런트엔드는 다음 작업)

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_favorites_api.py
from tests.conftest import make_settings


def _signup_and_token(client, email="a@example.com"):
    res = client.post("/api/auth/signup", json={"email": email, "password": "password123"})
    return res.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_create_list_and_get_favorite(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    res = client.post(
        "/api/favorites",
        json={"kind": "home", "label": "집", "lat": 37.5, "lon": 127.0, "address_text": "서울시 어딘가"},
        headers=_auth(token),
    )
    assert res.status_code == 201
    body = res.json()
    assert body["kind"] == "home" and body["label"] == "집" and "id" in body

    listed = client.get("/api/favorites", headers=_auth(token)).json()
    assert len(listed) == 1 and listed[0]["id"] == body["id"]


def test_second_home_is_409_but_second_custom_is_fine(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    client.post("/api/favorites", json={"kind": "home", "label": "집", "lat": 37.5, "lon": 127.0}, headers=_auth(token))
    dup = client.post("/api/favorites", json={"kind": "home", "label": "집2", "lat": 37.6, "lon": 127.1}, headers=_auth(token))
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "FAVORITE_KIND_TAKEN"

    c1 = client.post("/api/favorites", json={"kind": "custom", "label": "카페", "lat": 37.5, "lon": 127.0}, headers=_auth(token))
    c2 = client.post("/api/favorites", json={"kind": "custom", "label": "헬스장", "lat": 37.5, "lon": 127.0}, headers=_auth(token))
    assert c1.status_code == c2.status_code == 201


def test_patch_updates_fields_and_delete_removes_it(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    created = client.post("/api/favorites", json={"kind": "custom", "label": "원래이름", "lat": 37.5, "lon": 127.0}, headers=_auth(token)).json()

    patched = client.patch(f"/api/favorites/{created['id']}", json={"label": "바뀐이름"}, headers=_auth(token))
    assert patched.status_code == 200 and patched.json()["label"] == "바뀐이름"

    deleted = client.delete(f"/api/favorites/{created['id']}", headers=_auth(token))
    assert deleted.status_code == 204
    assert client.get("/api/favorites", headers=_auth(token)).json() == []


def test_patching_custom_to_home_checks_duplicate_too(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    client.post("/api/favorites", json={"kind": "home", "label": "집", "lat": 37.5, "lon": 127.0}, headers=_auth(token))
    custom = client.post("/api/favorites", json={"kind": "custom", "label": "어딘가", "lat": 37.5, "lon": 127.0}, headers=_auth(token)).json()

    res = client.patch(f"/api/favorites/{custom['id']}", json={"kind": "home"}, headers=_auth(token))
    assert res.status_code == 409 and res.json()["error"]["code"] == "FAVORITE_KIND_TAKEN"


def test_cannot_see_or_modify_another_users_favorite(make_client):
    client = make_client(lambda r: None)
    token_a = _signup_and_token(client, "a@example.com")
    token_b = _signup_and_token(client, "b@example.com")
    mine = client.post("/api/favorites", json={"kind": "custom", "label": "A의 장소", "lat": 37.5, "lon": 127.0}, headers=_auth(token_a)).json()

    get_as_b = client.get("/api/favorites", headers=_auth(token_b)).json()
    assert get_as_b == []

    patch_as_b = client.patch(f"/api/favorites/{mine['id']}", json={"label": "뺏음"}, headers=_auth(token_b))
    assert patch_as_b.status_code == 404

    delete_as_b = client.delete(f"/api/favorites/{mine['id']}", headers=_auth(token_b))
    assert delete_as_b.status_code == 404


def test_patch_with_explicit_null_keeps_existing_value(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    created = client.post("/api/favorites", json={"kind": "custom", "label": "이름", "lat": 37.5, "lon": 127.0}, headers=_auth(token)).json()

    res = client.patch(f"/api/favorites/{created['id']}", json={"lat": None}, headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["lat"] == 37.5  # null 은 무시되고 기존 값 유지


def test_patch_with_empty_body_changes_nothing(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    created = client.post("/api/favorites", json={"kind": "custom", "label": "이름", "lat": 37.5, "lon": 127.0}, headers=_auth(token)).json()

    res = client.patch(f"/api/favorites/{created['id']}", json={}, headers=_auth(token))
    assert res.status_code == 200 and res.json() == created


def test_all_endpoints_require_a_token():
    pass  # Step 3에서 make_client 로 바꿔 쓴다(아래 구현 참고)
```

(마지막 `test_all_endpoints_require_a_token`은 자리표시자다 — Step 3에서 `make_client` fixture를 받아 4개 엔드포인트를 토큰 없이 호출해 전부 401인지 확인하는 실제 테스트로 채운다.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_favorites_api.py -v`
Expected: FAIL — `404`(라우터 없음) 또는 `ModuleNotFoundError`

- [ ] **Step 3: Implement**

`backend/app/errors.py`의 `_ERRORS`에 추가:
```python
"FAVORITE_NOT_FOUND": (404, "즐겨찾기를 찾을 수 없습니다."),
"FAVORITE_KIND_TAKEN": (409, "집/회사는 하나만 등록할 수 있습니다. 기존 항목을 수정해 주세요."),
```

`backend/app/favorites/models.py`:
```python
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import Field, Index, SQLModel, text


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class FavoriteKind(str, Enum):
    home = "home"
    work = "work"
    custom = "custom"


class FavoritePlace(SQLModel, table=True):
    # custom 은 여러 개 허용, home/work 는 사용자당 하나뿐 - 사전 SELECT 검사의 레이스 컨디션을 막는 안전망.
    __table_args__ = (Index("ix_favorite_home_work_unique", "user_id", "kind", unique=True, sqlite_where=text("kind != 'custom'")),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    kind: FavoriteKind
    label: str
    lat: float
    lon: float
    address_text: str = ""
    created_at: datetime = Field(default_factory=_utcnow)


class FavoritePlaceCreate(SQLModel):
    kind: FavoriteKind
    label: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    address_text: str = ""


class FavoritePlaceUpdate(SQLModel):
    kind: Optional[FavoriteKind] = None
    label: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)
    address_text: Optional[str] = None


class FavoritePlacePublic(SQLModel):
    id: int
    kind: FavoriteKind
    label: str
    lat: float
    lon: float
    address_text: str
```

`backend/app/favorites/router.py`:
```python
from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.auth.deps import get_current_user
from app.auth.models import User
from app.errors import api_error
from app.favorites.models import FavoriteKind, FavoritePlace, FavoritePlaceCreate, FavoritePlacePublic, FavoritePlaceUpdate

router = APIRouter(prefix="/api/favorites", tags=["favorites"])

_KIND_ORDER = {FavoriteKind.home: 0, FavoriteKind.work: 1, FavoriteKind.custom: 2}


def _owned_or_404(session: Session, favorite_id: int, user: User) -> FavoritePlace:
    place = session.get(FavoritePlace, favorite_id)
    if place is None or place.user_id != user.id:
        raise api_error("FAVORITE_NOT_FOUND")
    return place


def _check_kind_not_taken(session: Session, user: User, kind: FavoriteKind, exclude_id: Optional[int] = None) -> None:
    if kind == FavoriteKind.custom:
        return
    existing = session.exec(select(FavoritePlace).where(FavoritePlace.user_id == user.id, FavoritePlace.kind == kind)).first()
    if existing is not None and existing.id != exclude_id:
        raise api_error("FAVORITE_KIND_TAKEN")


@router.get("", response_model=List[FavoritePlacePublic])
def list_favorites(request: Request, user: User = Depends(get_current_user)) -> List[FavoritePlace]:
    with Session(request.app.state.db_engine) as session:
        places = session.exec(select(FavoritePlace).where(FavoritePlace.user_id == user.id)).all()
        return sorted(places, key=lambda p: (_KIND_ORDER[p.kind], p.created_at))


@router.post("", response_model=FavoritePlacePublic, status_code=201)
def create_favorite(body: FavoritePlaceCreate, request: Request, user: User = Depends(get_current_user)) -> FavoritePlace:
    with Session(request.app.state.db_engine) as session:
        _check_kind_not_taken(session, user, body.kind)
        place = FavoritePlace(user_id=user.id, **body.model_dump())
        session.add(place)
        try:
            session.commit()
        except IntegrityError:
            # 사전 SELECT 검사를 통과한 뒤 동시 요청이 먼저 커밋된 경우(레이스) - 부분 유니크 인덱스가 막아준다.
            session.rollback()
            raise api_error("FAVORITE_KIND_TAKEN")
        session.refresh(place)
        return place


@router.patch("/{favorite_id}", response_model=FavoritePlacePublic)
def update_favorite(favorite_id: int, body: FavoritePlaceUpdate, request: Request, user: User = Depends(get_current_user)) -> FavoritePlace:
    with Session(request.app.state.db_engine) as session:
        place = _owned_or_404(session, favorite_id, user)
        # 명시적 null 은 "안 바꿈"으로 취급한다 - 모든 필드가 NOT NULL 이라 null 을 실제로 쓸 방법이 없다.
        updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
        if "kind" in updates:
            _check_kind_not_taken(session, user, updates["kind"], exclude_id=place.id)
        for field, value in updates.items():
            setattr(place, field, value)
        session.add(place)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            raise api_error("FAVORITE_KIND_TAKEN")
        session.refresh(place)
        return place


@router.delete("/{favorite_id}", status_code=204)
def delete_favorite(favorite_id: int, request: Request, user: User = Depends(get_current_user)) -> None:
    with Session(request.app.state.db_engine) as session:
        place = _owned_or_404(session, favorite_id, user)
        session.delete(place)
        session.commit()
```

`backend/app/main.py`: import `from app.favorites.router import router as favorites_router`, `app.include_router(favorites_router)` 추가, `allow_methods=["GET", "POST", "PATCH", "DELETE"]`로 변경.

`test_all_endpoints_require_a_token`을 실제 테스트로 채운다:
```python
def test_all_endpoints_require_a_token(make_client):
    client = make_client(lambda r: None)
    assert client.get("/api/favorites").status_code == 401
    assert client.post("/api/favorites", json={"kind": "custom", "label": "x", "lat": 0, "lon": 0}).status_code == 401
    assert client.patch("/api/favorites/1", json={"label": "x"}).status_code == 401
    assert client.delete("/api/favorites/1").status_code == 401
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_favorites_api.py -v`
Expected: PASS

- [ ] **Step 5: Run full backend suite + manual smoke check**

Run: `cd backend && .venv/bin/python -m pytest`
Expected: 전부 PASS

Run: 서버를 실제로 띄워 가입 → 즐겨찾기 생성 → 목록 조회 → 수정 → 삭제를 `curl`이나 `/docs`로 한 번 돌려 확인한다.

- [ ] **Step 6: Propose the commit (do NOT run it without user approval)**

```bash
git add backend/app/favorites backend/app/errors.py backend/app/main.py backend/tests/test_favorites_api.py
git commit -m "feat(backend): 즐겨찾기(집/회사/커스텀) CRUD API 추가"
```
