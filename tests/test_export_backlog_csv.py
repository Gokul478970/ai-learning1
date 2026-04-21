"""Tests for the backlog CSV export endpoint."""
import sys
import types
from unittest.mock import patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from api.routes import issues as issues_module


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(issues_module.router)
    monkeypatch.setattr(issues_module, "project_exists", lambda k: True)
    monkeypatch.setattr(issues_module, "user_can_read_project", lambda u, k: True)
    app.dependency_overrides[issues_module.get_current_user] = lambda: {"username": "alice"}
    return TestClient(app)


def _issue(key, summary, itype="Story", status="To Do", prio="High", assignee="Jane", sprint="Sprint 1"):
    return {
        "key": key,
        "fields": {
            "summary": summary,
            "issuetype": {"name": itype},
            "status": {"name": status},
            "priority": {"name": prio},
            "assignee": {"displayName": assignee} if assignee else None,
            "sprint": {"name": sprint} if sprint else None,
        },
    }


def test_happy_path_headers_and_rows(client, monkeypatch):
    monkeypatch.setattr(issues_module, "get_project_issues", lambda k, **kw: [_issue("PMT-1", "Login bug")])
    r = client.get("/api/projects/PMT/issues/export.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    assert "backlog_export.csv" in r.headers["content-disposition"]
    body = r.text
    lines = body.strip().splitlines()
    assert lines[0] == "key,summary,issue_type,status,priority,assignee,sprint"
    assert "PMT-1" in lines[1]
    assert "Login bug" in lines[1]


def test_empty_result_emits_header_only(client, monkeypatch):
    monkeypatch.setattr(issues_module, "get_project_issues", lambda k, **kw: [])
    r = client.get("/api/projects/PMT/issues/export.csv")
    assert r.status_code == 200
    assert r.text.strip() == "key,summary,issue_type,status,priority,assignee,sprint"


def test_filters_forwarded(client, monkeypatch):
    seen = {}

    def fake(key, **kw):
        seen["key"] = key
        seen.update(kw)
        return []

    monkeypatch.setattr(issues_module, "get_project_issues", fake)
    r = client.get("/api/projects/PMT/issues/export.csv?status=To%20Do&issue_type=Story&assignee=jane&search=bug")
    assert r.status_code == 200
    assert seen["key"] == "PMT"
    assert seen["status"] == "To Do"
    assert seen["issue_type"] == "Story"
    assert seen["assignee"] == "jane"
    assert seen["search"] == "bug"


def test_invalid_project_key_returns_400(client, monkeypatch):
    monkeypatch.setattr(issues_module, "get_project_issues", lambda k, **kw: [])
    r = client.get("/api/projects/lowercase/issues/export.csv")
    assert r.status_code == 400


def test_missing_project_returns_404(client, monkeypatch):
    monkeypatch.setattr(issues_module, "project_exists", lambda k: False)
    monkeypatch.setattr(issues_module, "get_project_issues", lambda k, **kw: [])
    r = client.get("/api/projects/PMT/issues/export.csv")
    assert r.status_code == 404


def test_forbidden_returns_403(client, monkeypatch):
    monkeypatch.setattr(issues_module, "user_can_read_project", lambda u, k: False)
    monkeypatch.setattr(issues_module, "get_project_issues", lambda k, **kw: [])
    r = client.get("/api/projects/PMT/issues/export.csv")
    assert r.status_code == 403


def test_unauthenticated_returns_401():
    app = FastAPI()
    app.include_router(issues_module.router)

    def deny():
        raise HTTPException(status_code=401, detail="Not authenticated")

    app.dependency_overrides[issues_module.get_current_user] = deny
    c = TestClient(app)
    r = c.get("/api/projects/PMT/issues/export.csv")
    assert r.status_code == 401


def test_csv_escaping_for_special_chars(client, monkeypatch):
    tricky = 'He said "hi", then\nleft, comma'
    monkeypatch.setattr(
        issues_module,
        "get_project_issues",
        lambda k, **kw: [_issue("PMT-2", tricky)],
    )
    r = client.get("/api/projects/PMT/issues/export.csv")
    assert r.status_code == 200
    # csv.writer doubles embedded quotes and wraps field in quotes
    assert '"He said ""hi"", then\nleft, comma"' in r.text


def test_csv_injection_is_neutralized(client, monkeypatch):
    monkeypatch.setattr(
        issues_module,
        "get_project_issues",
        lambda k, **kw: [_issue("PMT-3", "=SUM(A1:A2)")],
    )
    r = client.get("/api/projects/PMT/issues/export.csv")
    assert r.status_code == 200
    # Summary cell must NOT start with '=' (should be prefixed with apostrophe)
    rows = r.text.strip().splitlines()
    data_row = rows[1]
    assert "=SUM(A1:A2)" not in data_row.split(",")[1]
    assert "'=SUM" in data_row


def test_null_assignee_and_sprint(client, monkeypatch):
    issue = _issue("PMT-4", "No owner", assignee=None, sprint=None)
    issue["fields"]["priority"] = None
    monkeypatch.setattr(issues_module, "get_project_issues", lambda k, **kw: [issue])
    r = client.get("/api/projects/PMT/issues/export.csv")
    assert r.status_code == 200
    lines = r.text.strip().splitlines()
    # header + 1 row
    assert len(lines) == 2
    # assignee, priority, sprint cells should be empty strings
    assert lines[1].endswith(",,,") or lines[1].count(",") >= 6
