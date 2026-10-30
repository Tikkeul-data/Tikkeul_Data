from typing import Callable, List, Optional

import httpx
import pytest
from fastapi.testclient import TestClient

from app.cache import TtlCache
from app.config import Settings
from app.main import create_app
from tests.fixtures import KEYS


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


# jwt_secret 은 다른 인증키와 같은 "/api/health 의 configured 목록" 이라 KEYS 에 있다. database_url 은
# 그 목록에 없는 별도 설정이라 여기 따로 둔다 - 테스트가 실제 backend/data/tikkeul.db 를 건드리지 않도록 기본은 메모리 DB다.
AUTH_TEST_DEFAULTS = {"database_url": "sqlite:///:memory:"}


def make_settings(**over) -> Settings:
    return Settings(_env_file=None, **{**KEYS, **AUTH_TEST_DEFAULTS, **over})  # 실제 .env 를 읽지 않는다


@pytest.fixture
def make_client():
    """MockTransport 핸들러를 공공 API 대신 연결한 앱 클라이언트를 만든다."""
    opened: List[TestClient] = []

    def factory(handler: Callable[[httpx.Request], httpx.Response], settings: Optional[Settings] = None, cache: Optional[TtlCache] = None) -> TestClient:
        http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        client = TestClient(create_app(settings or make_settings(), http, cache))
        client.__enter__()
        opened.append(client)
        return client

    yield factory
    for client in opened:
        client.__exit__(None, None, None)


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()
