"""Request authentication via Microsoft Entra External ID (OIDC).

Auth is *optional*: requests without a bearer token resolve to an anonymous
caller (``None``), preserving the app's public-by-default behaviour. When a
token is present it is validated locally against the tenant's published JWKS —
steady-state validation does not round-trip to the identity provider (the key
set is cached) — and an invalid or expired token is rejected with 401.

Environment variables (all three required to enable auth; unset = auth off):
- ENTRA_TENANT_ID          the external tenant's directory (tenant) GUID
- ENTRA_TENANT_SUBDOMAIN   the tenant subdomain, e.g. "thelastquiz" (-> thelastquiz.ciamlogin.com)
- ENTRA_API_CLIENT_ID      the API app registration's client id; the expected token audience
"""

from __future__ import annotations

import functools
import os
from dataclasses import dataclass

import httpx
import jwt
from fastapi import HTTPException, Request
from jwt import PyJWKClient

__all__ = [
    "AuthConfig",
    "User",
    "frontend_config",
    "get_current_user",
    "load_auth_config",
    "require_user",
]

# The delegated scope the SPA requests; the API registration exposes exactly this
# one (see entra_thelastquiz.tf). A valid access token must carry it.
_REQUIRED_SCOPE = "access_as_user"


@dataclass(frozen=True)
class User:
    """The authenticated caller.

    ``id`` is the Entra object id (``oid``) — stable per user per tenant, and so
    suitable as an ownership key on runs and audit entries.
    """

    id: str
    email: str | None = None
    name: str | None = None


@dataclass(frozen=True)
class AuthConfig:
    tenant_id: str
    subdomain: str
    audience: str

    @property
    def configured(self) -> bool:
        return bool(self.tenant_id and self.subdomain and self.audience)

    @property
    def authority(self) -> str:
        return f"https://{self.subdomain}.ciamlogin.com/{self.tenant_id}/v2.0"


def load_auth_config() -> AuthConfig:
    return AuthConfig(
        tenant_id=os.environ.get("ENTRA_TENANT_ID", "").strip(),
        subdomain=os.environ.get("ENTRA_TENANT_SUBDOMAIN", "").strip(),
        audience=os.environ.get("ENTRA_API_CLIENT_ID", "").strip(),
    )


def frontend_config() -> dict:
    """Public (non-secret) Entra config for the browser SPA's MSAL client.

    Served to the SPA at ``GET /api/auth/config``. Returns ``enabled: False``
    until every value is present, so the frontend can hide sign-in cleanly while
    auth is still being provisioned.
    """
    tenant_id = os.environ.get("ENTRA_TENANT_ID", "").strip()
    subdomain = os.environ.get("ENTRA_TENANT_SUBDOMAIN", "").strip()
    client_id = os.environ.get("ENTRA_SPA_CLIENT_ID", "").strip()
    api_scope = os.environ.get("ENTRA_API_SCOPE", "").strip()
    enabled = bool(tenant_id and subdomain and client_id and api_scope)
    return {
        "enabled": enabled,
        "authority": f"https://{subdomain}.ciamlogin.com/{tenant_id}" if enabled else None,
        "known_authority": f"{subdomain}.ciamlogin.com" if subdomain else None,
        "client_id": client_id or None,
        "api_scope": api_scope or None,
    }


@functools.lru_cache(maxsize=4)
def _oidc_metadata(authority: str) -> dict:
    """Fetch and cache the tenant's OpenID configuration (issuer + jwks_uri)."""
    resp = httpx.get(f"{authority}/.well-known/openid-configuration", timeout=10.0)
    resp.raise_for_status()
    return resp.json()


@functools.lru_cache(maxsize=4)
def _jwk_client(jwks_uri: str) -> PyJWKClient:
    # PyJWKClient caches the JWK set (default lifespan 300s), so steady-state
    # validation does not hit the network on every request.
    return PyJWKClient(jwks_uri)


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header[:7].lower() == "bearer ":
        return header[7:].strip() or None
    return None


def _decode(token: str, cfg: AuthConfig, metadata: dict) -> dict:
    signing_key = _jwk_client(metadata["jwks_uri"]).get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=cfg.audience,
        issuer=metadata["issuer"],
        options={"require": ["exp", "iss", "aud"]},
    )


def get_current_user(request: Request) -> User | None:
    """Resolve the caller from a bearer token, or ``None`` if anonymous.

    Use as a FastAPI dependency. Raises 401 when a token is present but invalid,
    and 503 when auth is enabled yet the provider metadata is unreachable.
    """
    token = _bearer_token(request)
    if token is None:
        return None
    cfg = load_auth_config()
    if not cfg.configured:
        raise HTTPException(status_code=503, detail="Authentication is not configured")
    try:
        metadata = _oidc_metadata(cfg.authority)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=503, detail="Authentication provider is unavailable"
        ) from exc
    try:
        claims = _decode(token, cfg, metadata)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
    if _REQUIRED_SCOPE not in claims.get("scp", "").split():
        raise HTTPException(status_code=403, detail="Token is missing the required scope")
    subject = claims.get("oid") or claims.get("sub")
    if not subject:
        raise HTTPException(status_code=401, detail="Token is missing a subject claim")
    return User(
        id=subject,
        email=claims.get("preferred_username") or claims.get("email"),
        name=claims.get("name"),
    )


def require_user(request: Request) -> User:
    """Dependency variant that rejects anonymous callers with 401."""
    user = get_current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign-in required")
    return user
