import csv
import io
import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from pmtracker.store import json_store
from pmtracker.tools.transitions import STATUS_OBJECTS, TRANSITIONS

try:
    from api.routes.auth import get_current_user
except ImportError:  # pragma: no cover - fallback if import path differs
    from api.auth import get_current_user  # type: ignore

router = APIRouter(tags=["issues"])
logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


_PRIORITY_MAP = {"Highest": "1", "High": "2", "Medium": "3", "Low": "4", "Lowest": "5"}


class IssueCreate(BaseModel):
    project_key: str
    summary: str
    issue_type: str = "Story"
    description: str = ""
    assignee: str | None = None
    priority: str = "Medium"
    labels: list[str] = []
    components: list[str] = []
    epic_link: str | None = None
    sprint_id: str | None = None
    story_points: int | None = None
    estimate_hours: float | None = None
    parent_key: str | None = None
    fix_versions: list[str] = []


class IssueUpdate(BaseModel):
    summary: str | None = None
    description: str | None = None
    assignee: str | None = None
    priority: str | None = None
    labels: list[str] | None = None
    components: list[str] | None = None
    epic_link: str | None = None
    sprint_id: str | None = None
    story_points: int | None = None
    estimate_hours: float | None = None
    status: str | None = None
    parent_key: str | None = None
    fix_versions: list[str] | None = None
    issue_type: str | None = None


class IssueLinkCreate(BaseModel):
    type: str
    target_key: str


def _filter_issues(
    all_issues: list,
    project_id: str | None = None,
    status: str | None = None,
    assignee: str | None = None,
    priority: str | None = None,
    issue_type: str | None = None,
    sprint: str | None = None,
    epic: str | None = None,
) -> list:
    """Apply filter parameters to a list of issues. All string comparisons are case-insensitive."""
    filtered = all_issues

    if project_id:
        filtered = [
            i for i in filtered
            if (i.get("project_id") or i.get("project") or "").lower() == project_id.lower()
            or (i.get("key", "").split("-")[0].lower() == project_id.lower())
        ]
    if status:
        filtered = [i for i in filtered if (i.get("status") or "").lower() == status.lower()]
    if assignee:
        def _assignee_match(issue: dict) -> bool:
            a = issue.get("assignee")
            if a is None:
                return assignee.lower() in ("", "unassigned", "none", "null")
            if isinstance(a, dict):
                candidates = [
                    str(a.get("display_name") or ""),
                    str(a.get("displayName") or ""),
                    str(a.get("email") or ""),
                    str(a.get("name") or ""),
                    str(a.get("id") or ""),
                ]
                return any(c.lower() == assignee.lower() for c in candidates if c)
            return str(a).lower() == assignee.lower()
        filtered = [i for i in filtered if _assignee_match(i)]
    if priority:
        filtered = [i for i in filtered if (i.get("priority") or "").lower() == priority.lower()]
    if issue_type:
        filtered = [
            i for i in filtered
            if (i.get("issue_type") or i.get("type") or "").lower() == issue_type.lower()
        ]
    if sprint:
        def _sprint_match(issue: dict) -> bool:
            s = issue.get("sprint") or issue.get("sprint_id") or issue.get("sprint_name")
            if s is None:
                return sprint.lower() in ("", "backlog", "none", "null")
            if isinstance(s, dict):
                return any(
                    str(s.get(k) or "").lower() == sprint.lower()
                    for k in ("id", "name")
                )
            return str(s).lower() == sprint.lower()
        filtered = [i for i in filtered if _sprint_match(i)]
    if epic:
        filtered = [
            i for i in filtered
            if (i.get("epic_link") or i.get("epic") or "").lower() == epic.lower()
        ]
    return filtered


def _extract_assignee_display(assignee) -> str:
    if assignee is None:
        return ""
    if isinstance(assignee, dict):
        for k in ("display_name", "displayName", "name", "email", "id"):
            v = assignee.get(k)
            if v:
                return str(v)
        return ""
    return str(assignee)


def _extract_sprint_name(issue: dict) -> str:
    s = issue.get("sprint") or issue.get("sprint_name")
    if s is None:
        sid = issue.get("sprint_id")
        if not sid:
            return ""
        try:
            sprints = json_store.read_sprints() if hasattr(json_store, "read_sprints") else []
        except Exception:
            sprints = []
        for sp in sprints or []:
            if str(sp.get("id")) == str(sid):
                return str(sp.get("name") or "")
        return str(sid)
    if isinstance(s, dict):
        return str(s.get("name") or s.get("id") or "")
    return str(s)


_FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")


def _sanitize_csv_cell(value) -> str:
    """Neutralize CSV formula-injection by prefixing risky cells with a single quote."""
    if value is None:
        return ""
    s = str(value)
    if s and s[0] in _FORMULA_TRIGGERS:
        return "'" + s
    return s


CSV_HEADER = ["key", "summary", "issue_type", "status", "priority", "assignee", "sprint"]


def _iter_csv_rows(issues: list):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_HEADER)
    yield buf.getvalue()
    buf.seek(0)
    buf.truncate(0)

    for issue in issues:
        row = [
            _sanitize_csv_cell(issue.get("key") or ""),
            _sanitize_csv_cell(issue.get("summary") or ""),
            _sanitize_csv_cell(issue.get("issue_type") or issue.get("type") or ""),
            _sanitize_csv_cell(issue.get("status") or ""),
            _sanitize_csv_cell(issue.get("priority") or ""),
            _sanitize_csv_cell(_extract_assignee_display(issue.get("assignee"))),
            _sanitize_csv_cell(_extract_sprint_name(issue)),
        ]
        writer.writerow(row)
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)


@router.get("/issues/export-csv")
def export_backlog_csv(
    project_id: str | None = Query(default=None, pattern=r"^[A-Za-z0-9_-]+$"),
    status: str | None = Query(default=None),
    assignee: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    issue_type: str | None = Query(default=None),
    sprint: str | None = Query(default=None),
    epic: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Stream a CSV export of backlog issues filtered by the same contract as the list endpoint."""
    try:
        all_issues = json_store.read_issues()
    except Exception:
        logger.exception("Failed to read issues for CSV export")
        raise HTTPException(status_code=500, detail="Failed to read issues")

    # Authorization: admins see all; others limited to projects where they have assignments.
    is_admin = False
    user_email = None
    if isinstance(current_user, dict):
        is_admin = bool(current_user.get("is_admin") or current_user.get("role") == "Admin")
        user_email = current_user.get("email")
    else:
        is_admin = bool(getattr(current_user, "is_admin", False) or getattr(current_user, "role", None) == "Admin")
        user_email = getattr(current_user, "email", None)

    if not is_admin and user_email:
        try:
            assignments = json_store.read_assignments() if hasattr(json_store, "read_assignments") else []
        except Exception:
            assignments = []
        allowed_projects = {
            (a.get("project_key") or a.get("project_id") or "").lower()
            for a in (assignments or [])
            if (a.get("email") or "").lower() == str(user_email).lower() and not a.get("end_date")
        }
        if allowed_projects:
            def _issue_project(i: dict) -> str:
                return (i.get("project_id") or i.get("project") or (i.get("key", "").split("-")[0] if i.get("key") else "")).lower()
            all_issues = [i for i in all_issues if _issue_project(i) in allowed_projects]

    filtered = _filter_issues(
        all_issues,
        project_id=project_id,
        status=status,
        assignee=assignee,
        priority=priority,
        issue_type=issue_type,
        sprint=sprint,
        epic=epic,
    )

    headers = {
        "Content-Disposition": "attachment; filename=backlog_export.csv",
        "Cache-Control": "no-store",
    }
    return StreamingResponse(
        _iter_csv_rows(filtered),
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )
