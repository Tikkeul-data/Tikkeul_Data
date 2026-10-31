# 최근 목적지 서버 동기화(Task ③: Trip 로깅) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, following the `test-driven-development` and `verification-before-completion` skills. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 사용자가 길안내를 시작할 때마다 출발/목적지를 한 줄(`Trip`) 기록하고, 그걸로 "최근 목적지" 목록(`GET /api/trips/recent`)을 서버에서 동기화되게 한다. `feat/auth-foundation`에 의존하며, 즐겨찾기(`feat/favorites`)와는 독립적이다(다른 테이블, 서로 참조 안 함).

**Architecture:** `docs/AUTH_DESIGN.md` 5-1·5-3·5-4·7절. "최근 목적지"용 별도 테이블을 두지 않고 `Trip` 하나로 최근 목적지와(다음 Task ④의) "자주 가는 경로 제안"을 둘 다 계산한다는 설계를 그대로 따른다. 전체 GPS 경로는 저장하지 않고, 길안내 시작 시점의 출발/목적지 1건만 기록한다(N-02 위치정보 최소화).

**Tech Stack:** FastAPI, SQLModel(기존 엔진 재사용), pytest.

**Spec:** [docs/AUTH_DESIGN.md](../AUTH_DESIGN.md) 5-1절·5-3절·5-4절·7절(POST /api/trips, GET /api/trips/recent 행), [docs/REQUIREMENTS.md](../REQUIREMENTS.md) F-14.

## Global Constraints

- **스펙 불일치 하나 해소**: AUTH_DESIGN.md의 ERD(5절)는 `TRIP`에 `address_text`가 없는데, 같은 문서 7절의 `GET /api/trips/recent` 응답 스펙(`[{label, lat, lon, address_text, last_used_at}]`)은 `address_text`를 요구한다. 필드를 빼면 이미 문서화된 응답을 못 주므로, `Trip`에 `destination_address_text: str = ""`를 추가해 ERD 쪽을 보강하는 방향으로 해소한다(기존 `FavoritePlace.address_text`와 같은 패턴).
- `Trip`은 길안내가 **실제로 시작될 때만** 한 줄 생긴다(검색 결과 선택, 최근목적지 탭, 즐겨찾기 탭 등 어디서 시작했든 동일) — 이번 계획은 그 기록을 받는 `POST /api/trips` API까지만 만든다. 프런트엔드에서 언제 호출할지는 화면이 생기는 다음 작업이다.
- 좌표는 소수 3자리로 반올림한 "셀" 문자열(`origin_cell`/`destination_cell`, 예: `"37.566,126.978"`, 약 100m 격자)을 같이 저장해 반복 여부 판정에 쓴다(이번 Task는 저장만, 실제 반복 판정·제안은 Task ④).
- "최근 목적지"는 **같은 목적지 셀의 최신 1건만** 남기고 중복을 접는다(매번 다른 `Trip` row로 쌓이지만, 같은 장소를 반복 방문했다고 목록에 여러 번 뜨면 안 된다).
- 라우터 핸들러는 `def`로 선언한다(기존 `auth`·`favorites` 라우터와 같은 이유 — 동기 `Session`이 이벤트 루프를 막지 않게).
- 다른 사용자의 `Trip`은 절대 섞이지 않는다 — 모든 조회는 `user_id` 필터를 거친다.
- 이번 Task는 "자주 가는 경로 제안"(`GET /api/trips/suggestion`, Task ④)을 만들지 않는다 — `Trip`을 충분히 쌓아야 의미가 생기는 기능이라 분리해서 나중에 한다(AUTH_DESIGN.md 8절).
- **알려진 한계(이번엔 고치지 않음)**: 프런트엔드가 네트워크 재시도 등으로 같은 길안내 시작에 대해 `POST /api/trips`를 두 번 보내면 `Trip`이 중복으로 쌓인다. `/recent`는 셀 단위로 중복 제거하니 화면엔 안 보이지만, Task ④의 "N회 반복 방문" 집계는 그 중복을 그대로 세어 실제보다 더 자주 간 것처럼 판단할 수 있다. 멱등키(idempotency key) 같은 걸로 막을 수 있지만 이번 Task 범위 밖이다 — Task ④ 작업 시 이 한계를 먼저 참고해야 한다.

## Review Focus

- 같은 목적지(같은 `destination_cell`)를 세 번 방문한 기록이 있으면, 최근 목적지 목록엔 **가장 최근 1건만** 나와야 한다(세 번 다 나오면 "최근 목적지"가 아니라 "전체 이력"이 된다).
- 최근 목적지 목록은 **최신순**으로 와야 한다 — 그래야 "최근"이라는 이름값을 한다.
- `limit` 쿼리 파라미터가 실제로 결과 개수를 제한해야 한다(기본값·상한 둘 다).
- 사용자 A가 기록한 `Trip`이 사용자 B의 최근 목적지 목록에 절대 안 섞여야 한다.
- `POST /api/trips`·`GET /api/trips/recent` 둘 다 토큰 없이, 그리고 깨진 토큰으로도 401이어야 한다.
- 목적지 이름이 빈 문자열/공백뿐이면 422여야 한다 — 안 그러면 최근 목적지 목록에 빈 줄이 뜬다.

---

### Task 1: `Trip` 모델 + 서비스(중복 제거 로직) + 라우터

**Files:**
- Create: `backend/app/trips/__init__.py`(빈 파일)
- Create: `backend/app/trips/models.py`
- Create: `backend/app/trips/service.py`
- Create: `backend/app/trips/router.py`
- Modify: `backend/app/main.py` — `trips_router` 등록
- Test: `backend/tests/test_trips_api.py`

**Interfaces:**
- Consumes: `feat/auth-foundation`의 `User`, `get_current_user`, `app.state.db_engine`
- Produces: 없음(최종 소비 지점 — Task ④가 같은 `Trip` 테이블을 읽긴 하지만 이 라우터/서비스 함수를 직접 가져다 쓰진 않는다, 새 쿼리를 만든다)

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_trips_api.py
def _signup_and_token(client, email="a@example.com"):
    res = client.post("/api/auth/signup", json={"email": email, "password": "password123"})
    return res.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _trip_body(dest_label="스타벅스 강남점", dest_lat=37.5, dest_lon=127.0, origin_lat=37.4, origin_lon=126.9):
    return {
        "origin": {"lat": origin_lat, "lon": origin_lon},
        "destination": {"lat": dest_lat, "lon": dest_lon, "label": dest_label, "address_text": "서울시 강남구"},
    }


def test_post_trip_records_it(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    res = client.post("/api/trips", json=_trip_body(), headers=_auth(token))
    assert res.status_code == 201 and "id" in res.json()


def test_recent_returns_most_recent_first(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    client.post("/api/trips", json=_trip_body("첫번째", dest_lat=37.1, dest_lon=127.1), headers=_auth(token))
    client.post("/api/trips", json=_trip_body("두번째", dest_lat=37.2, dest_lon=127.2), headers=_auth(token))
    recent = client.get("/api/trips/recent", headers=_auth(token)).json()
    assert [r["label"] for r in recent] == ["두번째", "첫번째"]


def test_recent_dedupes_same_destination_cell_keeping_latest(make_client):
    # id 를 2차 정렬키로 쓰는지까지 확인하려고, 두 Trip을 같은 요청 흐름에서 연달아 넣는다
    # (테스트 환경은 벽시계 해상도가 낮을 수 있어 started_at 이 같은 값으로 찍힐 수 있다).
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    client.post("/api/trips", json=_trip_body("스타벅스(옛이름)", dest_lat=37.5, dest_lon=127.0), headers=_auth(token))
    client.post("/api/trips", json=_trip_body("스타벅스(새이름)", dest_lat=37.5001, dest_lon=127.0001), headers=_auth(token))  # 같은 셀(소수 3자리 반올림)
    recent = client.get("/api/trips/recent", headers=_auth(token)).json()
    assert len(recent) == 1 and recent[0]["label"] == "스타벅스(새이름)"


def test_recent_respects_limit(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    for i in range(5):
        client.post("/api/trips", json=_trip_body(f"목적지{i}", dest_lat=37.0 + i, dest_lon=127.0 + i), headers=_auth(token))
    recent = client.get("/api/trips/recent?limit=2", headers=_auth(token)).json()
    assert len(recent) == 2


def test_recent_default_limit_is_ten(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    for i in range(12):
        client.post("/api/trips", json=_trip_body(f"목적지{i}", dest_lat=37.0 + i, dest_lon=127.0 + i), headers=_auth(token))
    recent = client.get("/api/trips/recent", headers=_auth(token)).json()
    assert len(recent) == 10


def test_recent_limit_over_cap_is_422(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    res = client.get("/api/trips/recent?limit=999", headers=_auth(token))
    assert res.status_code == 422


def test_recent_destinations_are_scoped_to_the_user(make_client):
    client = make_client(lambda r: None)
    token_a = _signup_and_token(client, "a@example.com")
    token_b = _signup_and_token(client, "b@example.com")
    client.post("/api/trips", json=_trip_body(), headers=_auth(token_a))
    assert client.get("/api/trips/recent", headers=_auth(token_b)).json() == []


def test_trip_rejects_out_of_range_coordinates(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    bad_destination = client.post("/api/trips", json=_trip_body(dest_lat=999, dest_lon=127.0), headers=_auth(token))
    assert bad_destination.status_code == 422
    bad_origin = client.post("/api/trips", json=_trip_body(origin_lat=999, origin_lon=127.0), headers=_auth(token))
    assert bad_origin.status_code == 422


def test_trip_rejects_blank_destination_label(make_client):
    client = make_client(lambda r: None)
    token = _signup_and_token(client)
    res = client.post("/api/trips", json=_trip_body("   "), headers=_auth(token))
    assert res.status_code == 422


def test_trips_endpoints_require_a_token(make_client):
    client = make_client(lambda r: None)
    assert client.post("/api/trips", json=_trip_body()).status_code == 401
    assert client.get("/api/trips/recent").status_code == 401


def test_trips_endpoints_reject_a_garbage_token(make_client):
    client = make_client(lambda r: None)
    headers = _auth("not-a-real-token")
    assert client.post("/api/trips", json=_trip_body(), headers=headers).status_code == 401
    assert client.get("/api/trips/recent", headers=headers).status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_trips_api.py -v`
Expected: FAIL — 404(라우터 없음) 또는 `ModuleNotFoundError`

- [ ] **Step 3: Implement**

`backend/app/trips/models.py`:
```python
from datetime import datetime, timezone
from typing import Optional

from pydantic import field_validator
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Trip(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    origin_lat: float
    origin_lon: float
    origin_cell: str = Field(index=True)
    destination_lat: float
    destination_lon: float
    destination_cell: str = Field(index=True)
    destination_label: str
    destination_address_text: str = ""
    started_at: datetime = Field(default_factory=_utcnow, index=True)


class TripPoint(SQLModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class TripDestinationPoint(TripPoint):
    label: str
    address_text: str = ""

    @field_validator("label")
    @classmethod
    def _label_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("목적지 이름이 비어 있습니다.")
        return v


class TripCreate(SQLModel):
    origin: TripPoint
    destination: TripDestinationPoint


class TripCreated(SQLModel):
    id: int


class RecentDestination(SQLModel):
    label: str
    lat: float
    lon: float
    address_text: str
    last_used_at: datetime
```

`backend/app/trips/service.py`:
```python
from typing import List

from sqlmodel import Session, select

from app.trips.models import RecentDestination, Trip

CELL_PRECISION = 3  # 소수 3자리 ~= 100m 격자


def cell_of(lat: float, lon: float) -> str:
    return f"{round(lat, CELL_PRECISION)},{round(lon, CELL_PRECISION)}"


def recent_destinations(session: Session, user_id: int, limit: int) -> List[RecentDestination]:
    # started_at 만으로 정렬하면 벽시계 해상도 때문에 거의 동시에 들어온 두 Trip의 순서가 보장되지 않는다.
    # id 는 같은 SQLite 커넥션이 순서대로 매기는 값이라 안전한 2차 정렬 기준이 된다.
    trips = session.exec(
        select(Trip).where(Trip.user_id == user_id).order_by(Trip.started_at.desc(), Trip.id.desc())
    ).all()
    seen_cells = set()
    result: List[RecentDestination] = []
    for trip in trips:
        if trip.destination_cell in seen_cells:
            continue
        seen_cells.add(trip.destination_cell)
        result.append(
            RecentDestination(
                label=trip.destination_label,
                lat=trip.destination_lat,
                lon=trip.destination_lon,
                address_text=trip.destination_address_text,
                last_used_at=trip.started_at,
            )
        )
        if len(result) >= limit:
            break
    return result
```
(shortcut: 사용자의 모든 Trip을 Python으로 순회해 중복을 접는다 - SQL `GROUP BY`로 더 효율적으로 짤 수 있지만, 7일 프로젝트 사용자당 기록량에서는 차이가 없고 로직이 더 읽기 쉽다. 사용자당 기록이 수만 건으로 늘면 SQL 집계로 올려야 한다.)

`backend/app/trips/router.py`:
```python
from fastapi import APIRouter, Depends, Query, Request
from sqlmodel import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.trips.models import RecentDestination, Trip, TripCreate, TripCreated
from app.trips.service import cell_of, recent_destinations

router = APIRouter(prefix="/api/trips", tags=["trips"])


@router.post("", response_model=TripCreated, status_code=201)
def create_trip(body: TripCreate, request: Request, user: User = Depends(get_current_user)) -> TripCreated:
    with Session(request.app.state.db_engine) as session:
        trip = Trip(
            user_id=user.id,
            origin_lat=body.origin.lat,
            origin_lon=body.origin.lon,
            origin_cell=cell_of(body.origin.lat, body.origin.lon),
            destination_lat=body.destination.lat,
            destination_lon=body.destination.lon,
            destination_cell=cell_of(body.destination.lat, body.destination.lon),
            destination_label=body.destination.label,
            destination_address_text=body.destination.address_text,
        )
        session.add(trip)
        session.commit()
        session.refresh(trip)
        return TripCreated(id=trip.id)


@router.get("/recent", response_model=list[RecentDestination])
def get_recent(request: Request, limit: int = Query(default=10, ge=1, le=50), user: User = Depends(get_current_user)) -> list:
    with Session(request.app.state.db_engine) as session:
        return recent_destinations(session, user.id, limit)
```

(`list[RecentDestination]`은 Python 3.9에서 타입 힌트로만 쓰면 되지만, FastAPI의 `response_model`에 그대로 써도 된다 — 이미 이 코드베이스의 다른 라우터도 `List[...]`를 쓰므로 일관성 있게 `from typing import List`로 맞춘다.)

`backend/app/main.py`: `from app.trips.router import router as trips_router` 추가, `app.include_router(trips_router)` 추가. (CORS는 GET/POST만 쓰므로 건드릴 필요 없다.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_trips_api.py -v`
Expected: PASS

- [ ] **Step 5: Run full backend suite + manual smoke check**

Run: `cd backend && .venv/bin/python -m pytest`
Expected: 전부 PASS

Run: 서버를 실제로 띄워 가입 → Trip 2~3건 기록(같은 셀 포함) → `/api/trips/recent`로 중복 제거·최신순을 curl로 확인한다.

- [ ] **Step 6: Propose the commit (do NOT run it without user approval)**

```bash
git add backend/app/trips backend/app/main.py backend/tests/test_trips_api.py
git commit -m "feat(backend): 최근 목적지 서버 동기화(Trip 기록·조회) 추가"
```
