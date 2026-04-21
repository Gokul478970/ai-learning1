"""Tests for the CSV export endpoint GET /api/issues/export/csv.

These tests directly exercise the endpoint function and helpers
without requiring the full application or conftest fixtures,
making them self-contained and runnable by pytest in any environment.

The sys.path manipulation ensures the `api` package is importable even when
pytest is invoked from the workspace root without installing the package.
"""
import csv
import io
import os
import sys

# ---------------------------------------------------------------------------
# Ensure the workspace root is on sys.path so `api` and `pmtracker` packages
# are importable regardless of how/where pytest is invoked.
# ---------------------------------------------------------------------------
_WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Import the router and helper functions under test
from api.routes.issues import (
    CSV_HEADERS,
    _filter_issues,
    _issue_to_csv_row,
    router,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_issue(
    key="TEST-1",
    summary="Test summary",
    status="To Do",
    assignee_name=None,
    priority="Medium",
    issue_type="Story",
    sprint=None,
    project_key="TEST",
    epic=None,
):
    """Helper to build a minimal issue dict matching the store format."""
    assignee = None
    if assignee_name:
        assignee = {"accountId": "user-1", "displayName": assignee_name}
    return {
        "id": "10001",
        "key": key,
        "fields": {
            "summary": summary,
            "status": {"id": "1", "name": status},
            "issuetype": {"id": "2", "name": issue_type},
            "priority": {"id": "3", "name": priority},
            "assignee": assignee,
            "project": {"key": project_key, "id": "p1"},
            "sprint": sprint,
            "epic": epic,
        },
    }


SAMPLE_ISSUES = [
    _make_issue(
        key="PROJ-1",
        summary="First issue",
        status="To Do",
        assignee_name="Alice",
        priority="High",
        issue_type="Story",
        sprint="sprint-1",
        project_key="PROJ",
    ),
    _make_issue(
        key="PROJ-2",
        summary="Second issue",
        status="In Progress",
        assignee_name="Bob",
        priority="Medium",
        issue_type="Bug",
        sprint=None,
        project_key="PROJ",
    ),
    _make_issue(
        key="OTHER-1",
        summary="Other project issue",
        status="Done",
        assignee_name="Charlie",
        priority="Low",
        issue_type="Task",
        sprint="sprint-2",
        project_key="OTHER",
    ),
]


@pytest.fixture()
def client():
    """Create a TestClient with the issues router mounted at /api."""
    app = FastAPI()
    app.include_router(router, prefix="/api")
    return TestClient(app)


# ---------------------------------------------------------------------------
# Unit tests for helper functions
# ---------------------------------------------------------------------------


class TestIssueToCSVRow:
    def test_full_issue(self):
        issue = _make_issue(
            key="A-1",
            summary="Sum",
            status="Done",
            assignee_name="Zoe",
            priority="High",
            issue_type="Bug",
            sprint="s1",
        )
        row = _issue_to_csv_row(issue)
        assert row == ["A-1", "Sum", "Done", "Zoe", "High", "Bug", "s1"]

    def test_missing_assignee(self):
        issue = _make_issue(assignee_name=None)
        row = _issue_to_csv_row(issue)
        assert row[3] == ""  # assignee column

    def test_missing_sprint(self):
        issue = _make_issue(sprint=None)
        row = _issue_to_csv_row(issue)
        assert row[6] == ""  # sprint column

    def test_empty_fields(self):
        issue = {"key": "X-1", "fields": {}}
        row = _issue_to_csv_row(issue)
        assert row[0] == "X-1"
        assert all(v == "" for v in row[1:])


class TestFilterIssues:
    def test_filter_by_project(self):
        result = _filter_issues(SAMPLE_ISSUES, project_id="PROJ")
        assert len(result) == 2
        assert all(i["fields"]["project"]["key"] == "PROJ" for i in result)

    def test_filter_by_status(self):
        result = _filter_issues(SAMPLE_ISSUES, status="In Progress")
        assert len(result) == 1
        assert result[0]["key"] == "PROJ-2"

    def test_filter_by_assignee(self):
        result = _filter_issues(SAMPLE_ISSUES, assignee="Alice")
        assert len(result) == 1
        assert result[0]["key"] == "PROJ-1"

    def test_filter_by_priority(self):
        result = _filter_issues(SAMPLE_ISSUES, priority="Low")
        assert len(result) == 1
        assert result[0]["key"] == "OTHER-1"

    def test_filter_by_issue_type(self):
        result = _filter_issues(SAMPLE_ISSUES, issue_type="Bug")
        assert len(result) == 1
        assert result[0]["key"] == "PROJ-2"

    def test_filter_by_sprint(self):
        result = _filter_issues(SAMPLE_ISSUES, sprint="sprint-1")
        assert len(result) == 1
        assert result[0]["key"] == "PROJ-1"

    def test_filter_by_epic(self):
        issues = [_make_issue(key="E-1", epic="EPIC-1"), _make_issue(key="E-2", epic="EPIC-2")]
        result = _filter_issues(issues, epic="EPIC-1")
        assert len(result) == 1
        assert result[0]["key"] == "E-1"

    def test_filter_case_insensitive(self):
        result = _filter_issues(SAMPLE_ISSUES, project_id="proj")
        assert len(result) == 2

    def test_combined_filters(self):
        result = _filter_issues(SAMPLE_ISSUES, project_id="PROJ", status="To Do")
        assert len(result) == 1
        assert result[0]["key"] == "PROJ-1"

    def test_no_filters(self):
        result = _filter_issues(SAMPLE_ISSUES)
        assert len(result) == 3

    def test_no_match(self):
        result = _filter_issues(SAMPLE_ISSUES, project_id="NOPE")
        assert len(result) == 0


class TestCSVHeaders:
    def test_header_values(self):
        assert CSV_HEADERS == ["key", "summary", "status", "assignee", "priority", "issue_type", "sprint"]

    def test_header_count_matches_row(self):
        issue = _make_issue()
        row = _issue_to_csv_row(issue)
        assert len(row) == len(CSV_HEADERS)


# ---------------------------------------------------------------------------
# Integration tests for the endpoint via TestClient
# ---------------------------------------------------------------------------


class TestExportCSVEndpoint:
    @patch("api.routes.issues.json_store")
    def test_returns_csv_content_type(self, mock_store, client):
        mock_store.get_issues.return_value = []
        resp = client.get("/api/issues/export/csv")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    @patch("api.routes.issues.json_store")
    def test_returns_content_disposition(self, mock_store, client):
        mock_store.get_issues.return_value = []
        resp = client.get("/api/issues/export/csv")
        assert "content-disposition" in resp.headers
        assert "backlog-export-" in resp.headers["content-disposition"]
        assert ".csv" in resp.headers["content-disposition"]

    @patch("api.routes.issues.json_store")
    def test_empty_result_has_header_row_only(self, mock_store, client):
        mock_store.get_issues.return_value = []
        resp = client.get("/api/issues/export/csv")
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 1  # header only
        assert rows[0] == CSV_HEADERS

    @patch("api.routes.issues.json_store")
    def test_csv_with_data(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv?project_id=PROJ")
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 3  # 1 header + 2 data rows
        assert rows[0] == CSV_HEADERS
        # Verify first data row
        assert rows[1][0] == "PROJ-1"
        assert rows[1][1] == "First issue"

    @patch("api.routes.issues.json_store")
    def test_filter_by_project_id(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv?project_id=PROJ")
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        # Should only include PROJ issues
        keys = [r[0] for r in rows[1:]]
        assert "PROJ-1" in keys
        assert "PROJ-2" in keys
        assert "OTHER-1" not in keys

    @patch("api.routes.issues.json_store")
    def test_filter_by_status(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv?status=In+Progress")
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2  # header + 1 match
        assert rows[1][0] == "PROJ-2"

    @patch("api.routes.issues.json_store")
    def test_filter_by_assignee(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv?assignee=Alice")
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][3] == "Alice"

    @patch("api.routes.issues.json_store")
    def test_filter_by_priority(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv?priority=High")
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "PROJ-1"

    @patch("api.routes.issues.json_store")
    def test_filter_by_issue_type(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv?issue_type=Bug")
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "PROJ-2"

    @patch("api.routes.issues.json_store")
    def test_filter_by_sprint(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv?sprint=sprint-1")
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "PROJ-1"

    @patch("api.routes.issues.json_store")
    def test_filter_by_epic(self, mock_store, client):
        issues = [
            _make_issue(key="E-1", epic="EPIC-1", project_key="P"),
            _make_issue(key="E-2", epic="EPIC-2", project_key="P"),
        ]
        mock_store.get_issues.return_value = issues
        resp = client.get("/api/issues/export/csv?epic=EPIC-1")
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "E-1"

    @patch("api.routes.issues.json_store")
    def test_combined_filters(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv?project_id=PROJ&status=To+Do")
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "PROJ-1"

    @patch("api.routes.issues.json_store")
    def test_no_project_filter_returns_all(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv")
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 4  # header + 3 issues

    @patch("api.routes.issues.json_store")
    def test_csv_valid_syntax(self, mock_store, client):
        """Ensure the CSV is syntactically valid and parseable."""
        mock_store.get_issues.return_value = [
            _make_issue(key="Q-1", summary='Has "quotes" and, commas'),
        ]
        resp = client.get("/api/issues/export/csv")
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][1] == 'Has "quotes" and, commas'
