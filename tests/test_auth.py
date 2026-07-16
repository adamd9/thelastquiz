from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from starlette.requests import Request

from llm_pop_quiz_bench.core import auth

TENANT_ID = "00000000-0000-0000-0000-000000000000"
ISSUER = f"https://thelastquiz.ciamlogin.com/{TENANT_ID}/v2.0"
AUDIENCE = "11111111-1111-1111-1111-111111111111"
OID = "22222222-2222-2222-2222-222222222222"


@pytest.fixture
def keypair():
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return priv, priv.public_key()


@pytest.fixture(autouse=True)
def configured_env(monkeypatch):
    monkeypatch.setenv("ENTRA_TENANT_ID", TENANT_ID)
    monkeypatch.setenv("ENTRA_TENANT_SUBDOMAIN", "thelastquiz")
    monkeypatch.setenv("ENTRA_API_CLIENT_ID", AUDIENCE)


@pytest.fixture(autouse=True)
def patched_provider(monkeypatch, keypair):
    _, public_key = keypair

    class _Key:
        key = public_key

    class _Client:
        def get_signing_key_from_jwt(self, token):
            return _Key()

    monkeypatch.setattr(
        auth,
        "_oidc_metadata",
        lambda authority: {"issuer": ISSUER, "jwks_uri": "https://example/keys"},
    )
    monkeypatch.setattr(auth, "_jwk_client", lambda jwks_uri: _Client())


def _request(token: str | None) -> Request:
    headers = []
    if token is not None:
        headers.append((b"authorization", f"Bearer {token}".encode()))
    return Request({"type": "http", "headers": headers})


def _mint(priv, **overrides) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "oid": OID,
        "scp": "access_as_user",
        "preferred_username": "quizzer@example.com",
        "name": "Quiz Zer",
        "iat": now,
        "exp": now + timedelta(hours=1),
    }
    payload.update(overrides)
    return jwt.encode(payload, priv, algorithm="RS256", headers={"kid": "test"})


def test_no_token_is_anonymous():
    assert auth.get_current_user(_request(None)) is None


def test_valid_token_resolves_user(keypair):
    priv, _ = keypair
    user = auth.get_current_user(_request(_mint(priv)))
    assert user is not None
    assert user.id == OID
    assert user.email == "quizzer@example.com"
    assert user.name == "Quiz Zer"


def test_expired_token_rejected(keypair):
    priv, _ = keypair
    now = datetime.now(timezone.utc)
    token = _mint(priv, iat=now - timedelta(hours=2), exp=now - timedelta(hours=1))
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(_request(token))
    assert exc.value.status_code == 401


def test_wrong_audience_rejected(keypair):
    priv, _ = keypair
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(_request(_mint(priv, aud="someone-else")))
    assert exc.value.status_code == 401


def test_wrong_issuer_rejected(keypair):
    priv, _ = keypair
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(_request(_mint(priv, iss="https://evil.example/v2.0")))
    assert exc.value.status_code == 401


def test_bad_signature_rejected():
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(_request(_mint(other)))
    assert exc.value.status_code == 401


def test_missing_scope_rejected(keypair):
    priv, _ = keypair
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(_request(_mint(priv, scp="other.scope")))
    assert exc.value.status_code == 403


def test_unconfigured_but_token_present_is_503(keypair, monkeypatch):
    priv, _ = keypair
    monkeypatch.delenv("ENTRA_TENANT_ID", raising=False)
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(_request(_mint(priv)))
    assert exc.value.status_code == 503


def test_require_user_rejects_anonymous():
    with pytest.raises(HTTPException) as exc:
        auth.require_user(_request(None))
    assert exc.value.status_code == 401


def test_require_user_allows_valid(keypair):
    priv, _ = keypair
    assert auth.require_user(_request(_mint(priv))).id == OID


def test_frontend_config_disabled_when_unset(monkeypatch):
    for var in (
        "ENTRA_TENANT_ID",
        "ENTRA_TENANT_SUBDOMAIN",
        "ENTRA_SPA_CLIENT_ID",
        "ENTRA_API_SCOPE",
    ):
        monkeypatch.delenv(var, raising=False)
    cfg = auth.frontend_config()
    assert cfg["enabled"] is False
    assert cfg["client_id"] is None


def test_frontend_config_enabled_when_set(monkeypatch):
    monkeypatch.setenv("ENTRA_TENANT_ID", TENANT_ID)
    monkeypatch.setenv("ENTRA_TENANT_SUBDOMAIN", "thelastquiz")
    monkeypatch.setenv("ENTRA_SPA_CLIENT_ID", "spa-client-id")
    monkeypatch.setenv("ENTRA_API_SCOPE", "api://thelastquiz-api/access_as_user")
    cfg = auth.frontend_config()
    assert cfg["enabled"] is True
    assert cfg["client_id"] == "spa-client-id"
    assert cfg["authority"] == f"https://thelastquiz.ciamlogin.com/{TENANT_ID}"
    assert cfg["known_authority"] == "thelastquiz.ciamlogin.com"
    assert cfg["api_scope"] == "api://thelastquiz-api/access_as_user"
