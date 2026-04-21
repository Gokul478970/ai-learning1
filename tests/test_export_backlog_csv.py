import io
import csv
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    from api import main as api_main  # type: ignore
    from api.routes import issues as issues_module

    # Override auth dependency to simulate an authenticated admin user.
    def _fake_user():
        return {"email": "admin@example.com", "is_admin": True, "role": "Admin"}

    try:
        from api.routes.auth import get_current_user as _real_gcu  # type: ignore
    except Exception:  # pragma: no cover
        _real_gcu = issues_module.get_current_user  # type: ignore

    app = api_main.app  # type: ignore[attr-defined]
    app.dependency_overrides[_real_gcu] = _fake_user
    app.dependency_overrides[issues_module.get_current_user] = _fake_user

    yield TestClient(app), issues_module, monkeypatch

    app.dependency_overrides.clear()


def test_export_csv_happy_path_returns_csv_headers(client):
    tc, issues_module, monkeypatch = client
    sample = [
        {
            "key": "ABC-1",
            "summary": "Normal, summary with, commas",
            "issue_type": "Story",
            "status": "To Do",
            "priority": "Medium",
            "assignee": {"display_name": "Alice"},
            "sprint": {"name": "Sprint 1"},
        },
        {
            "key": "ABC-2",
            "summary": "No assignee, no sprint",
            "issue_type": "Task",
            "status": "Done",
            "priority": "Low",
            "assignee": None,
            "sprint": None,
        },
    ]
    monkeypatch.setattr(issues_module.json_store, "read_issues", lambda: sample)

    resp = tc.get("/api/issues/export-csv")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "attachment" in resp.headers["content-disposition"]
    assert "backlog_export.csv" in resp.headers["content-disposition"]

    reader = csv.reader(io.StringIO(resp.text))
    rows = list(reader)
    assert rows[0] == ["key", "summary", "issue_type", "status", "priority", "assignee", "sprint"]
    assert len(rows) == 3
    assert rows[1][5] == "Alice"
    assert rows[1][6] == "Sprint 1"
    # Empty assignee / sprint columns for ABC-2
    assert rows[2][5] == ""
    assert rows[2][6] == ""


def test_export_csv_empty_result_returns_only_header(client):
    tc, issues_module, monkeypatch = client
    monkeypatch.setattr(issues_module.json_store, "read_issues", lambda: [])
    resp = tc.get("/api/issues/export-csv")
    assert resp.status_code == 200
    rows = list(csv.reader(io.StringIO(resp.text)))
    assert len(rows) == 1
    assert rows[0] == ["key", "summary", "issue_type", "status", "priority", "assignee", "sprint"]


def test_export_csv_formula_injection_sanitized(client):
    tc, issues_module, monkeypatch = client
    sample = [
        {
            "key": "ABC-1",
            "summary": "=SUM(A1:A10)",
            "issue_type": "Story",
            "status": "To Do",
            "priority": "Medium",
            "assignee": {"display_name": "+cmd|'/c calc'!A1"},
            "sprint": {"name": "-bad"},
        },
    ]
    monkeypatch.setattr(issues_module.json_store, "read_issues", lambda: sample)
    resp = tc.get("/api/issues/export-csv")
    assert resp.status_code == 200
    rows = list(csv.reader(io.StringIO(resp.text)))
    # header + 1 data row
    assert len(rows) == 2
    data = rows[1]
    # Each dangerous cell must be prefixed with a single quote
    assert data[1].startswith("'=")
    assert data[5].startswith("'+")
    assert data[6].startswith("'-")


def test_export_csv_500_does_not_leak_exception_details(client):
    tc, issues_module, monkeypatch = client

    def _boom():
        raise RuntimeError("/secret/internal/path/db.json corrupt")

    monkeypatch.setattr(issues_module.json_store, "read_issues", _boom)
    resp = tc.get("/api/issues/export-csv")
    assert resp.status_code == 500
    body = resp.json()
    assert "/secret/internal/path" not in body.get("detail", "")
    assert body.get("detail") == "Failed to read issues"


def test_export_csv_requires_auth():
    # Without dependency override, unauthenticated request should not return 200 CSV.
    from api import main as api_main  # type: ignore
    tc = TestClient(api_main.app)
    resp = tc.get("/api/issues/export-csv")
    assert resp.status_code in (401, 403)
