"""Issues API routes with CSV export support."""
from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from api.deps import get_current_user
from pmtracker.store import issues_store

# Module-level CSV header constant — single source of truth for the issues CSV export.
# MUST remain at module scope so it is importable as `from api.routes.issues import CSV_HEADERS`.
CSV_HEADERS: list[str] = [
    "Key",
    "Summary",
    "Type",
    "Status",
    "Priority",
    "Assignee",
    "Reporter",
    "Created",
    "Updated",
    "Labels",
    "Components",
    "Sprint",
    "Story Points",
    "Estimate Hours",
    "Fix Versions",
    "Description",
]

router = APIRouter(prefix="/issues", tags=["issues"])


def _format_csv_value(value: Any) -> str:
    """Format a single CSV cell value, joining lists with '; ' and coercing None to ''."""
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return "; ".join("" if v is None else str(v) for v in value)
    return str(value)


def _issue_to_csv_row(issue: dict) -> list[str]:
    """Convert an issue dict into an ordered CSV row matching CSV_HEADERS."""
    field_map = {
        "Key": issue.get("key"),
        "Summary": issue.get("summary"),
        "Type": issue.get("type") or issue.get("issue_type"),
        "Status": issue.get("status"),
        "Priority": issue.get("priority"),
        "Assignee": issue.get("assignee"),
        "Reporter": issue.get("reporter"),
        "Created": issue.get("created") or issue.get("created_at"),
        "Updated": issue.get("updated") or issue.get("updated_at"),
        "Labels": issue.get("labels"),
        "Components": issue.get("components"),
        "Sprint": issue.get("sprint"),
        "Story Points": issue.get("story_points"),
        "Estimate Hours": issue.get("estimate_hours"),
        "Fix Versions": issue.get("fix_versions"),
        "Description": issue.get("description"),
    }
    return [_format_csv_value(field_map[h]) for h in CSV_HEADERS]


@router.get("/export.csv")
def export_issues_csv(
    project_key: str = Query(..., min_length=1),
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """Stream issues for the given project as a CSV using CSV_HEADERS as header row."""
    try:
        issues = issues_store.list_issues(project_key=project_key)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_HEADERS)
    for issue in issues:
        writer.writerow(_issue_to_csv_row(issue))

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{project_key}-issues.csv"'},
    )
