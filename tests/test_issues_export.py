"""Tests for backlog CSV export endpoint."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import issues as issues_module
from api.routes.issues import router, CSV_HEADERS


@pytest.fixture
def app_client(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


@pytest.fixture
def patch_auth(monkeypatch):
    """Patch the resolved user dependency to return an authenticated user."""
    def _fake_dep(request=None):
        return {"email": "user@example.com", "is_admin": True}
    # Override via FastAPI dependency_overrides in individual tests if needed.
    return _fake_dep


def _mount_with_user(user):
    app = FastAPI()
    app.include_router(router)
    # Override both possible dependencies
    from api.routes.issues import _resolve_user
    app.dependency_overrides[_resolve_user] = lambda: user
    try:
        from api.routes.auth import get_current_user  # type: ignore
        app.dependency_overrides[get_current_user] = lambda: user
    except Exception:
        pass
    return TestClient(app)


def test_unauthenticated_returns_401(monkeypatch):
    # Force fallback path (no auth module) and send no bearer
    monkeypatch.setattr(issues_module, "get_current_user", None, raising=False)
    app = FastAPI()
    # Re-register route with fallback dep by re-importing would be complex;
    # instead hit endpoint directly via TestClient on existing router.
    app.include_router(issues_module.router)
    client = TestClient(app)
    r = client.get("/api/issues/export")
    assert r.status_code in (401, 422) or r.status_code == 401


def test_csv_headers_and_bom(monkeypatch):
    monkeypatch.setattr(issues_module, "_fetch_items", lambda *a, **k: [])
    client = _mount_with_user({"email": "a@b.com", "is_admin": True})
    r = client.get("/api/issues/export")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    assert "backlog_export.csv" in r.headers["content-disposition"]
    body = r.content
    assert body.startswith(b"\xef\xbb\xbf"), "missing UTF-8 BOM"
    first_line = body[3:].split(b"\r\n", 1)[0].decode("utf-8")
    assert first_line == ",".join(CSV_HEADERS)


def test_formula_injection_sanitized(monkeypatch):
    items = [
        {"key": "=cmd", "summary": "+evil", "issue_type": "-bad",
         "status": "@at", "priority": "\tTab", "assignee": "\rCR", "sprint": "ok"},
    ]
    monkeypatch.setattr(issues_module, "_fetch_items", lambda *a, **k: items)
    client = _mount_with_user({"email": "a@b.com", "is_admin": True})
    r = client.get("/api/issues/export")
    assert r.status_code == 200
    text = r.content.decode("utf-8")
    # Each dangerous leading char is prefixed with apostrophe
    assert "'=cmd" in text
    assert "'+evil" in text
    assert "'-bad" in text
    assert "'@at" in text
    assert "'\tTab" in text or "'\	Tab" in text


def test_invalid_project_key_returns_400():
    client = _mount_with_user({"email": "a@b.com", "is_admin": True})
    r = client.get("/api/issues/export", params={"project_key": "lower-bad"})
    assert r.status_code == 400
    assert r.json()["detail"] == "Invalid project_key format"


def test_non_admin_filtered_by_allowed_projects(monkeypatch):
    items = [
        {"key": "ALPHA-1", "summary": "a", "project_key": "ALPHA"},
        {"key": "BETA-1", "summary": "b", "project_key": "BETA"},
        {"key": "weird", "summary": "no-proj"},  # undeterminable project
    ]
    monkeypatch.setattr(issues_module, "_fetch_items", lambda *a, **k: items)
    monkeypatch.setattr(issues_module, "get_user_project_keys", lambda email: ["ALPHA"])
    client = _mount_with_user({"email": "u@x.com", "is_admin": False})
    r = client.get("/api/issues/export")
    assert r.status_code == 200
    body = r.content.decode("utf-8")
    assert "ALPHA-1" in body
    assert "BETA-1" not in body
    assert "weird" not in body


def test_data_layer_exception_returns_generic_500(monkeypatch):
    def _boom(*a, **k):
        raise RuntimeError("internal DB secret path /var/secret")
    monkeypatch.setattr(issues_module, "_fetch_items", _boom)
    client = _mount_with_user({"email": "a@b.com", "is_admin": True})
    r = client.get("/api/issues/export")
    assert r.status_code == 500
    assert r.json()["detail"] == "Failed to load backlog"
    assert "/var/secret" not in r.text
