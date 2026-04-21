"""Issues routes including CSV export for the Product Backlog."""
from __future__ import annotations

import csv
import io
import logging
import re
from typing import Any, Iterable, Iterator

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

try:
    from api.routes.auth import get_current_user
except Exception:  # pragma: no cover
    def get_current_user(request: Request) -> dict:
        auth = request.headers.get("Authorization", "") if request else ""
        if not auth.lower().startswith("bearer "):
            raise HTTPException(status_code=401, detail="Not authenticated")
        return {"username": "unknown"}

try:
    from pmtracker.api_client import get_project_issues
except Exception:  # pragma: no cover
    def get_project_issues(project_key: str, **kwargs: Any) -> list[dict]:
        raise HTTPException(status_code=500, detail="issues backend unavailable")

logger = logging.getLogger(__name__)

try:
    from pmtracker.store.json_store import project_exists, user_can_read_project
except Exception:  # pragma: no cover
    logger.warning(
        "pmtracker.store.json_store authz helpers unavailable; falling back to deny-by-default"
    )

    def project_exists(project_key: str) -> bool:
        return False

    def user_can_read_project(user: dict, project_key: str) -> bool:
        return False

router = APIRouter(prefix="/api", tags=["issues"])

PROJECT_KEY_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")
CSV_COLUMNS = ["key", "summary", "issue_type", "status", "priority", "assignee", "sprint"]
_FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")


def _validate_project_key(project_key: str) -> None:
    """Validate project_key against the contract pattern."""
    if not PROJECT_KEY_PATTERN.match(project_key or ""):
        raise HTTPException(status_code=400, detail="Invalid project_key")


def _get(obj: Any, *names: str, default: Any = "") -> Any:
    """Safely read an attribute or key from obj, falling through names."""
    if obj is None:
        return default
    for name in names:
        if isinstance(obj, dict) and name in obj and obj[name] is not None:
            return obj[name]
        val = getattr(obj, name, None)
        if val is not None:
            return val
    return default


def _sanitize_cell(value: Any) -> str:
    """Stringify a cell value and neutralize CSV/formula-injection triggers."""
    if value is None:
        return ""
    text = str(value)
    if text and text[0] in _FORMULA_TRIGGERS:
        text = "'" + text
    return text


def _extract_fields(issue: Any) -> dict[str, str]:
    """Extract the seven export columns from a backlog issue."""
    fields = issue.get("fields", {}) if isinstance(issue, dict) else getattr(issue, "fields", {}) or {}
    key = _get(issue, "key", default="")
    summary = _get(fields, "summary", default="")
    issue_type = _get(_get(fields, "issuetype", "issue_type", default={}) or {}, "name", default="")
    status = _get(_get(fields, "status", default={}) or {}, "name", default="")
    priority = _get(_get(fields, "priority", default={}) or {}, "name", default="")
    assignee_obj = _get(fields, "assignee", default=None)
    assignee = "" if assignee_obj is None else _get(assignee_obj, "displayName", "display_name", "name", default="")
    sprint_raw = _get(fields, "sprint", "customfield_sprint", default=None)
    if sprint_raw is None:
        sprint = ""
    elif isinstance(sprint_raw, list):
        sprint = ", ".join(
            _get(s, "name", default="") if not isinstance(s, str) else s
            for s in sprint_raw
            if s is not None
        )
    elif isinstance(sprint_raw, (dict,)) or hasattr(sprint_raw, "name"):
        sprint = _get(sprint_raw, "name", default="")
    else:
        sprint = str(sprint_raw)
    return {
        "key": _sanitize_cell(key),
        "summary": _sanitize_cell(summary),
        "issue_type": _sanitize_cell(issue_type),
        "status": _sanitize_cell(status),
        "priority": _sanitize_cell(priority),
        "assignee": _sanitize_cell(assignee),
        "sprint": _sanitize_cell(sprint),
    }


def _iter_csv(issues: Iterable[Any]) -> Iterator[str]:
    """Yield CSV text chunks for the header and each issue row."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_COLUMNS)
    yield buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)
    for issue in issues or []:
        row = _extract_fields(issue)
        writer.writerow([row[c] for c in CSV_COLUMNS])
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)


def _fetch_issues(
    project_key: str,
    status: str | None,
    issue_type: str | None,
    assignee: str | None,
    search: str | None,
) -> list[Any]:
    """Call get_project_issues with filters, with a Python-side fallback."""
    filters = {
        "status": status,
        "issue_type": issue_type,
        "assignee": assignee,
        "search": search,
    }
    active = {k: v for k, v in filters.items() if v}
    try:
        return list(get_project_issues(project_key, **active) or [])
    except TypeError:
        all_issues = list(get_project_issues(project_key) or [])
        result = []
        for issue in all_issues:
            row = _extract_fields(issue)
            if status and row["status"].lower() != status.lower():
                continue
            if issue_type and row["issue_type"].lower() != issue_type.lower():
                continue
            if assignee and row["assignee"].lower() != assignee.lower():
                continue
            if search and search.lower() not in row["summary"].lower():
                continue
            result.append(issue)
        return result


@router.get("/projects/{project_key}/issues/export.csv")
def export_backlog_csv(
    project_key: str,
    status: str | None = Query(default=None),
    issue_type: str | None = Query(default=None),
    assignee: str | None = Query(default=None),
    search: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """Stream a CSV export of backlog issues for the given project."""
    _validate_project_key(project_key)
    if not project_exists(project_key):
        raise HTTPException(status_code=404, detail="Project not found")
    if not user_can_read_project(current_user, project_key):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        issues = _fetch_issues(project_key, status, issue_type, assignee, search)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("export_backlog_csv failed: %s", exc)
        raise HTTPException(status_code=500, detail="Export failed") from exc

    headers = {
        "Content-Disposition": 'attachment; filename=backlog_export.csv',
        "Cache-Control": "no-store",
    }
    return StreamingResponse(
        _iter_csv(issues),
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )
