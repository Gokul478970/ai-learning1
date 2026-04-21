import pytest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes.issues import router, _sanitize_csv_cell


@pytest.fixture
def client():
    app = FastAPI()

    @app.middleware("http")
    async def auth_mw(request, call_next):
        token = request.headers.get("Authorization", "")
        if token.startswith("Bearer admin"):
            request.state.user_email = "admin@example.com"
        elif token.startswith("Bearer member"):
            request.state.user_email = "member@example.com"
        elif token.startswith("Bearer outsider"):
            request.state.user_email = "outsider@example.com"
        return await call_next(request)

    app.include_router(router, prefix="/api")
    return TestClient(app)


@pytest.fixture
def seed_data():
    projects = [{"key": "PROJ", "name": "Project"}]
    users = [
        {"email": "admin@example.com", "role": "Admin"},
        {"email": "member@example.com", "role": "Dev"},
        {"email": "outsider@example.com", "role": "Dev"},
    ]
    assignments = [{"user_email": "member@example.com", "project_key": "PROJ"}]
    issues = [
        {
            "key": "PROJ-1",
            "fields": {
                "project": {"key": "PROJ"},
                "summary": "Hello, world",
                "issuetype": {"name": "Story"},
                "status": {"name": "To Do"},
                "priority": {"name": "High"},
                "assignee": {"displayName": "Alice"},
                "sprint": {"name": "Sprint 1"},
            },
        },
        {
            "key": "PROJ-2",
            "fields": {
                "project": {"key": "PROJ"},
                "summary": "=cmd|calc",
                "issuetype": {"name": "Bug"},
                "status": {"name": "Done"},
                "priority": None,
                "assignee": None,
                "sprint": None,
            },
        },
    ]
    def read(name):
        return {"projects": projects, "users": users, "assignments": assignments, "issues": issues}.get(name, [])
    return read


def test_sanitize_prefixes_dangerous_cells():
    assert _sanitize_csv_cell("=cmd").startswith("'")
    assert _sanitize_csv_cell("+1").startswith("'")
    assert _sanitize_csv_cell("-1").startswith("'")
    assert _sanitize_csv_cell("@x").startswith("'")
    assert _sanitize_csv_cell("hello") == "hello"
    assert _sanitize_csv_cell(None) == ""


def test_export_unauthenticated_returns_401(client):
    r = client.get("/api/projects/PROJ/issues/export")
    assert r.status_code == 401


def test_export_invalid_project_key_400(client):
    r = client.get("/api/projects/lowercase/issues/export", headers={"Authorization": "Bearer admin"})
    assert r.status_code == 400


def test_export_unknown_project_404(client, seed_data):
    with patch("api.routes.issues.json_store.read", side_effect=seed_data):
        r = client.get("/api/projects/NOPE/issues/export", headers={"Authorization": "Bearer admin"})
    assert r.status_code == 404


def test_export_forbidden_for_outsider(client, seed_data):
    with patch("api.routes.issues.json_store.read", side_effect=seed_data):
        r = client.get("/api/projects/PROJ/issues/export", headers={"Authorization": "Bearer outsider"})
    assert r.status_code == 403


def test_export_happy_path_admin(client, seed_data):
    with patch("api.routes.issues.json_store.read", side_effect=seed_data):
        r = client.get("/api/projects/PROJ/issues/export", headers={"Authorization": "Bearer admin"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert 'filename="backlog_export_PROJ_' in r.headers["content-disposition"]
    body = r.content
    assert body.startswith(b"\xef\xbb\xbf")
    text = body.decode("utf-8-sig")
    lines = text.strip().split("\r\n")
    assert lines[0] == "Key,Summary,Issue Type,Status,Priority,Assignee,Sprint"
    assert any(line.startswith("PROJ-1,") for line in lines[1:])
    # CSV injection neutralized
    assert any("'=cmd|calc" in line for line in lines[1:])


def test_export_member_access_with_filter(client, seed_data):
    with patch("api.routes.issues.json_store.read", side_effect=seed_data):
        r = client.get(
            "/api/projects/PROJ/issues/export?status=Done",
            headers={"Authorization": "Bearer member"},
        )
    assert r.status_code == 200
    text = r.content.decode("utf-8-sig")
    lines = [l for l in text.strip().split("\r\n") if l]
    assert len(lines) == 2  # header + one matching row
    assert "PROJ-2" in lines[1]


def test_export_empty_result_has_header_only(client, seed_data):
    with patch("api.routes.issues.json_store.read", side_effect=seed_data):
        r = client.get(
            "/api/projects/PROJ/issues/export?status=Nonexistent",
            headers={"Authorization": "Bearer admin"},
        )
    assert r.status_code == 200
    text = r.content.decode("utf-8-sig")
    lines = [l for l in text.strip().split("\r\n") if l]
    assert len(lines) == 1
    assert lines[0].startswith("Key,Summary")
