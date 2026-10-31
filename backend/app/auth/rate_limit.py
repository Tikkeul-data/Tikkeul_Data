"""인증메일 재전송 쿨다운·가입 인증번호 시도 제한. 메모리 전용 - 서버 재시작이나 다중 워커 간에는 공유되지 않는다.
shortcut: 단일 프로세스 가정(지금 배포 규모에 맞춤). 워커를 여러 개 띄우게 되면 Redis 등 공유 저장소로 바꿔야 한다."""
import threading
import time
from typing import Callable, Dict, Hashable, Tuple

DEFAULT_COOLDOWN_S = 60.0


class ResendCooldown:
    def __init__(self, cooldown_s: float = DEFAULT_COOLDOWN_S, clock: Callable[[], float] = time.monotonic):
        self._cooldown_s = cooldown_s
        self._clock = clock
        self._lock = threading.Lock()
        self._last_sent_at: Dict[Hashable, float] = {}

    def try_mark(self, key: Hashable) -> bool:
        """쿨다운이 끝났으면 True 를 돌려주고 시각을 기록한다. 아직 쿨다운 중이면 False(시각은 안 바뀐다)."""
        now = self._clock()
        with self._lock:
            last = self._last_sent_at.get(key)
            if last is not None and now - last < self._cooldown_s:
                return False
            self._last_sent_at[key] = now
            return True


class AttemptLimiter:
    """키(이메일 등)별로 일정 시간 안의 시도 횟수를 센다. 가입 인증번호를 무작정 틀려보는 걸 막는 용도."""

    def __init__(self, max_attempts: int = 5, window_s: float = 600.0, clock: Callable[[], float] = time.monotonic):
        self._max_attempts = max_attempts
        self._window_s = window_s
        self._clock = clock
        self._lock = threading.Lock()
        self._attempts: Dict[Hashable, Tuple[int, float]] = {}  # key -> (시도 횟수, 첫 시도 시각)

    def try_attempt(self, key: Hashable) -> bool:
        """이번 시도를 허용하면 True(카운트 올림). 한도를 넘었으면 False."""
        now = self._clock()
        with self._lock:
            count, first_at = self._attempts.get(key, (0, now))
            if now - first_at > self._window_s:
                count, first_at = 0, now
            if count >= self._max_attempts:
                return False
            self._attempts[key] = (count + 1, first_at)
            return True

    def reset(self, key: Hashable) -> None:
        with self._lock:
            self._attempts.pop(key, None)
