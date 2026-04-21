"""Unit tests for CSV export helper functions."""
import os
import sys

_WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

import pytest
from api.routes.issues import (
    CSV_HEADERS,
    _filter_issues,
    _issue_to_csv_row,
    _csv_export_filename,
)


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


class TestCSVExportFilename:
    def test_filename_format(self):
        filename = _csv_export_filename()
        assert filename.startswith("backlog-export-")
        assert filename.endswith(".csv")

    def test_filename_contains_date(self):
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        filename = _csv_export_filename()
        assert today in filename


class TestIssueToCSVRowEdgeCases:
    def test_issue_with_no_fields_key(self):
        issue = {"key": "Z-1"}
        row = _issue_to_csv_row(issue)
        assert row[0] == "Z-1"

    def test_issue_with_none_sprint(self):
        issue = _make_issue(sprint=None)
        row = _issue_to_csv_row(issue)
        assert row[6] == ""

    def test_row_length_matches_headers(self):
        issue = _make_issue()
        row = _issue_to_csv_row(issue)
        assert len(row) == len(CSV_HEADERS)


class TestFilterIssuesEdgeCases:
    def test_empty_issue_list(self):
        assert _filter_issues([], project_id="X") == []

    def test_none_values_in_fields(self):
        issue = {
            "id": "1",
            "key": "N-1",
            "fields": {
                "project": {"key": "N"},
                "status": {"name": None},
                "assignee": None,
                "priority": {"name": None},
                "issuetype": {"name": None},
                "sprint": None,
                "epic": None,
            },
        }
        result = _filter_issues([issue], project_id="N")
        assert len(result) == 1
