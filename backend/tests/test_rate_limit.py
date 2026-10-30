from app.auth.rate_limit import ResendCooldown


def test_second_attempt_within_cooldown_is_blocked(clock):
    limiter = ResendCooldown(cooldown_s=60.0, clock=clock)
    assert limiter.try_mark(1) is True
    assert limiter.try_mark(1) is False


def test_attempt_after_cooldown_elapses_is_allowed_again(clock):
    limiter = ResendCooldown(cooldown_s=60.0, clock=clock)
    assert limiter.try_mark(1) is True
    clock.advance(60.0)
    assert limiter.try_mark(1) is True


def test_different_users_do_not_share_a_cooldown(clock):
    limiter = ResendCooldown(cooldown_s=60.0, clock=clock)
    assert limiter.try_mark(1) is True
    assert limiter.try_mark(2) is True
