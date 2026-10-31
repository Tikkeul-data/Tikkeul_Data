import httpx

from app.auth import mailer
from tests.conftest import make_settings


def _patch_resend_http(monkeypatch, status=200, payload=None):
    sent = []
    real_client = httpx.Client

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(status, json=payload if payload is not None else {"id": "email-id"})

    monkeypatch.setattr(mailer.httpx, "Client", lambda *a, **kw: real_client(*a, transport=httpx.MockTransport(handler), **kw))
    return sent


def test_send_verification_email_without_api_key_does_not_call_network(monkeypatch):
    real_client = httpx.Client

    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("resend_api_key 가 없으면 네트워크를 호출하지 않아야 한다")

    monkeypatch.setattr(mailer.httpx, "Client", lambda *a, **kw: real_client(*a, transport=httpx.MockTransport(handler), **kw))
    settings = make_settings(resend_api_key=None)
    assert mailer.send_verification_email("a@example.com", "tok", settings) is False


def test_send_verification_email_success_sends_bearer_key_and_link(monkeypatch):
    sent = _patch_resend_http(monkeypatch, status=200)
    settings = make_settings(resend_api_key="SECRET-RESEND-KEY", api_base_url="https://api.example.com")
    assert mailer.send_verification_email("a@example.com", "tok-123", settings) is True
    assert len(sent) == 1
    req = sent[0]
    assert req.headers["authorization"] == "Bearer SECRET-RESEND-KEY"
    body = req.read()
    assert b"a@example.com" in body
    assert b"https://api.example.com/api/auth/verify-email?token=tok-123" in body


def test_send_verification_email_non_2xx_response_is_false(monkeypatch):
    _patch_resend_http(monkeypatch, status=401, payload={"message": "invalid api key"})
    settings = make_settings(resend_api_key="SECRET-RESEND-KEY")
    assert mailer.send_verification_email("a@example.com", "tok", settings) is False


def test_send_verification_email_network_error_is_false(monkeypatch):
    real_client = httpx.Client

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    monkeypatch.setattr(mailer.httpx, "Client", lambda *a, **kw: real_client(*a, transport=httpx.MockTransport(handler), **kw))
    settings = make_settings(resend_api_key="SECRET-RESEND-KEY")
    assert mailer.send_verification_email("a@example.com", "tok", settings) is False


def test_send_verification_email_does_not_close_an_injected_client():
    sent = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(200, json={"id": "email-id"})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    settings = make_settings(resend_api_key="SECRET-RESEND-KEY")
    try:
        assert mailer.send_verification_email("a@example.com", "tok", settings, client=client) is True
        assert len(sent) == 1
        assert client.is_closed is False  # 주입한 client 는 호출부 책임 - mailer 가 닫으면 안 된다
    finally:
        client.close()
