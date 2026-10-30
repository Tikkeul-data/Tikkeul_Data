"""인증메일 재전송 쿨다운. 메모리 전용 - 서버 재시작이나 다중 워커 간에는 공유되지 않는다.
shortcut: 단일 프로세스 가정(지금 배포 규모에 맞춤). 워커를 여러 개 띄우게 되면 Redis 등 공유 저장소로 바꿔야 한다."""
import threading
import time
from typing import Callable, Dict

DEFAULT_COOLDOWN_S = 60.0


class ResendCooldown:
    def __init__(self, cooldown_s: float = DEFAULT_COOLDOWN_S, clock: Callable[[], float] = time.monotonic):
        self._cooldown_s = cooldown_s
        self._clock = clock
        self._lock = threading.Lock()
        self._last_sent_at: Dict[int, float] = {}

    def try_mark(self, user_id: int) -> bool:
        """쿨다운이 끝났으면 True 를 돌려주고 시각을 기록한다. 아직 쿨다운 중이면 False(시각은 안 바뀐다)."""
        now = self._clock()
        with self._lock:
            last = self._last_sent_at.get(user_id)
            if last is not None and now - last < self._cooldown_s:
                return False
            self._last_sent_at[user_id] = now
            return True
