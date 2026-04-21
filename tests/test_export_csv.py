"""Tests for the CSV export endpoint GET /api/issues/export/csv.

These tests directly exercise the endpoint function and helpers
without requiring the full application or conftest fixtures,
making them self-contained and runnable by pytest in any environment.
"""
import csv
import io
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
        summary="Other project",
        status="Done",
        assignee_name=None,
        priority="Low",
        issue_type="Task",
        sprint=None,
        project_key="OTHER",
    ),
]


@pytest.fixture()
def app():
    """Create a minimal FastAPI app with only the issues router for testing."""
    _app = FastAPI()
    _app.include_router(router, prefix="/api")
    return _app


@pytest.fixture()
def client(app):
    return TestClient(app)


# ---------------------------------------------------------------------------
# Helper unit tests
# ---------------------------------------------------------------------------


class TestIssueToCSVRow:
    def test_basic_row(self):
        issue = _make_issue(
            key="X-1",
            summary="Hello",
            status="In Progress",
            assignee_name="Alice",
            priority="High",
            issue_type="Bug",
            sprint="sprint-5",
        )
        row = _issue_to_csv_row(issue)
        assert row == ["X-1", "Hello", "In Progress", "Alice", "High", "Bug", "sprint-5"]

    def test_no_assignee(self):
        issue = _make_issue(assignee_name=None)
        row = _issue_to_csv_row(issue)
        assert row[3] == ""

    def test_no_sprint(self):
        issue = _make_issue(sprint=None)
        row = _issue_to_csv_row(issue)
        assert row[6] == ""


class TestFilterIssues:
    def test_filter_by_project(self):
        result = _filter_issues(SAMPLE_ISSUES, project_id="PROJ")
        assert len(result) == 2
        assert all(i["fields"]["project"]["key"] == "PROJ" for i in result)

    def test_filter_by_status(self):
        result = _filter_issues(SAMPLE_ISSUES, status="Done")
        assert len(result) == 1
        assert result[0]["key"] == "OTHER-1"

    def test_filter_by_assignee(self):
        result = _filter_issues(SAMPLE_ISSUES, assignee="alice")
        assert len(result) == 1
        assert result[0]["key"] == "PROJ-1"

    def test_filter_by_priority(self):
        result = _filter_issues(SAMPLE_ISSUES, priority="Low")
        assert len(result) == 1

    def test_filter_by_issue_type(self):
        result = _filter_issues(SAMPLE_ISSUES, issue_type="bug")
        assert len(result) == 1
        assert result[0]["key"] == "PROJ-2"

    def test_filter_by_sprint(self):
        result = _filter_issues(SAMPLE_ISSUES, sprint="sprint-1")
        assert len(result) == 1
        assert result[0]["key"] == "PROJ-1"

    def test_filter_combined(self):
        result = _filter_issues(SAMPLE_ISSUES, project_id="PROJ", status="To Do")
        assert len(result) == 1
        assert result[0]["key"] == "PROJ-1"

    def test_no_filters_returns_all(self):
        result = _filter_issues(SAMPLE_ISSUES)
        assert len(result) == len(SAMPLE_ISSUES)


# ---------------------------------------------------------------------------
# Endpoint integration tests
# ---------------------------------------------------------------------------


class TestExportCSVEndpoint:
    """Integration tests for GET /api/issues/export/csv."""

    @patch("api.routes.issues.json_store")
    def test_export_returns_200_with_csv_content_type(self, mock_store, client):
        mock_store.get_issues.return_value = []
        resp = client.get("/api/issues/export/csv")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    @patch("api.routes.issues.json_store")
    def test_export_content_disposition_header(self, mock_store, client):
        mock_store.get_issues.return_value = []
        resp = client.get("/api/issues/export/csv")
        cd = resp.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert "backlog_export.csv" in cd

    @patch("api.routes.issues.json_store")
    def test_export_empty_backlog_returns_header_only(self, mock_store, client):
        mock_store.get_issues.return_value = []
        resp = client.get("/api/issues/export/csv")
        text = resp.text
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert len(rows) == 1  # header row only
        assert rows[0] == CSV_HEADERS

    @patch("api.routes.issues.json_store")
    def test_export_with_issues(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv")
        assert resp.status_code == 200
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        # 1 header + 3 data rows
        assert len(rows) == 4
        assert rows[0] == CSV_HEADERS
        # First data row
        assert rows[1][0] == "PROJ-1"
        assert rows[1][1] == "First issue"

    @patch("api.routes.issues.json_store")
    def test_export_filtered_by_project(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv", params={"project_id": "PROJ"})
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        # header + 2 PROJ issues
        assert len(rows) == 3
        keys = [r[0] for r in rows[1:]]
        assert "PROJ-1" in keys
        assert "PROJ-2" in keys
        assert "OTHER-1" not in keys

    @patch("api.routes.issues.json_store")
    def test_export_filtered_by_status(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv", params={"status": "Done"})
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2  # header + 1 Done issue
        assert rows[1][0] == "OTHER-1"

    @patch("api.routes.issues.json_store")
    def test_export_filtered_by_assignee(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv", params={"assignee": "Bob"})
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "PROJ-2"

    @patch("api.routes.issues.json_store")
    def test_export_filtered_by_priority(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv", params={"priority": "High"})
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "PROJ-1"

    @patch("api.routes.issues.json_store")
    def test_export_filtered_by_issue_type(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv", params={"issue_type": "Task"})
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "OTHER-1"

    @patch("api.routes.issues.json_store")
    def test_export_filtered_by_sprint(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv", params={"sprint": "sprint-1"})
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "PROJ-1"

    @patch("api.routes.issues.json_store")
    def test_export_multiple_filters(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get(
            "/api/issues/export/csv",
            params={"project_id": "PROJ", "status": "In Progress"},
        )
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "PROJ-2"

    @patch("api.routes.issues.json_store")
    def test_export_csv_special_characters(self, mock_store, client):
        """Verify csv.writer handles commas, quotes, newlines in field values."""
        special_issue = _make_issue(
            key="SP-1",
            summary='Has "quotes" and, commas\nand newlines',
            status="To Do",
        )
        mock_store.get_issues.return_value = [special_issue]
        resp = client.get("/api/issues/export/csv")
        assert resp.status_code == 200
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "SP-1"
        assert '"quotes"' in rows[1][1]

    @patch("api.routes.issues.json_store")
    def test_export_utf8_encoding(self, mock_store, client):
        """Verify UTF-8 characters are preserved in the CSV output."""
        utf8_issue = _make_issue(
            key="UTF-1",
            summary="Ünïcödé chàracters \u4f60\u597d",
            status="To Do",
        )
        mock_store.get_issues.return_value = [utf8_issue]
        resp = client.get("/api/issues/export/csv")
        assert resp.status_code == 200
        assert "Ünïcödé" in resp.text
        assert "\u4f60\u597d" in resp.text

    @patch("api.routes.issues.json_store")
    def test_export_no_filter_matches_returns_header_only(self, mock_store, client):
        mock_store.get_issues.return_value = list(SAMPLE_ISSUES)
        resp = client.get("/api/issues/export/csv", params={"project_id": "NONEXISTENT"})
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0] == CSV_HEADERS

    @patch("api.routes.issues.json_store")
    def test_csv_header_columns(self, mock_store, client):
        """AC-4: CSV must have header row with the specified columns."""
        mock_store.get_issues.return_value = []
        resp = client.get("/api/issues/export/csv")
        reader = csv.reader(io.StringIO(resp.text))
        header = next(reader)
        assert header == ["key", "summary", "status", "assignee", "priority", "issue_type", "sprint"]
