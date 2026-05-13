import csv
import io
import re
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from pmtracker.store import json_store
from pmtracker.tools.transitions import STATUS_OBJECTS, TRANSITIONS

router = APIRouter(tags=["issues"])

_PROJECT_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,15}$")


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
            if (i.get("fields", {}).get("project", {}).get("key") or "").lower() == project_id.lower()
        ]

    if status:
        filtered = [
            i for i in filtered
            if (i.get("fields", {}).get("status", {}).get("name") or "").lower() == status.lower()
        ]

    if assignee:
        if assignee.lower() == "unassigned":
            filtered = [i for i in filtered if not i.get("fields", {}).get("assignee")]
        else:
            filtered = [
                i for i in filtered
                if (
                    (i.get("fields", {}).get("assignee") or {}).get("emailAddress", "").lower() == assignee.lower()
                    or (i.get("fields", {}).get("assignee") or {}).get("displayName", "").lower() == assignee.lower()
                )
            ]

    if priority:
        filtered = [
            i for i in filtered
            if (i.get("fields", {}).get("priority", {}).get("name") or "").lower() == priority.lower()
        ]

    if issue_type:
        filtered = [
            i for i in filtered
            if (i.get("fields", {}).get("issuetype", {}).get("name") or "").lower() == issue_type.lower()
        ]

    if sprint:
        if sprint.lower() == "backlog" or sprint.lower() == "none":
            filtered = [i for i in filtered if not i.get("fields", {}).get("sprint")]
        else:
            filtered = [
                i for i in filtered
                if str((i.get("fields", {}).get("sprint") or {}).get("id", "")) == str(sprint)
                or (i.get("fields", {}).get("sprint") or {}).get("name", "").lower() == sprint.lower()
            ]

    if epic:
        filtered = [
            i for i in filtered
            if (i.get("fields", {}).get("epic_link") or "").lower() == epic.lower()
        ]

    return filtered


def _get_user_email(request: Request) -> str:
    email = getattr(request.state, "user_email", None)
    if not email:
        raise HTTPException(status_code=401, detail="Authentication required")
    return email


def _user_can_access_project(email: str, project_key: str) -> bool:
    """Check whether the authenticated user can access the given project."""
    try:
        from api.routes.assignments import get_user_project_keys
    except Exception:
        get_user_project_keys = None

    try:
        users = json_store.read("users") or []
    except Exception:
        users = []
    user = next((u for u in users if (u.get("email") or "").lower() == email.lower()), None)
    if user and (user.get("role") or "").lower() == "admin":
        return True

    if get_user_project_keys is not None:
        try:
            keys = get_user_project_keys(email) or []
            if project_key in keys or project_key.upper() in [k.upper() for k in keys]:
                return True
        except Exception:
            pass

    try:
        assignments = json_store.read("assignments") or []
    except Exception:
        assignments = []
    for a in assignments:
        if (a.get("user_email") or "").lower() == email.lower() and (a.get("project_key") or "").upper() == project_key.upper():
            return True
    return False


def _project_exists(project_key: str) -> bool:
    try:
        projects = json_store.read("projects") or []
    except Exception:
        return False
    return any((p.get("key") or "").upper() == project_key.upper() for p in projects)


_CSV_INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _sanitize_csv_cell(value) -> str:
    """Neutralize CSV-injection: prepend ' to cells starting with =,+,-,@,\\t,\\r."""
    if value is None:
        return ""
    s = str(value)
    if s and s[0] in _CSV_INJECTION_PREFIXES:
        return "'" + s
    return s


@router.get("/projects/{project_key}/issues/export")
def export_backlog_csv(
    project_key: str,
    request: Request,
    status: str | None = Query(None),
    assignee: str | None = Query(None),
    priority: str | None = Query(None),
    issue_type: str | None = Query(None),
    sprint: str | None = Query(None),
    epic: str | None = Query(None),
    search: str | None = Query(None),
):
    """Stream a CSV export of backlog issues for the given project."""
    if not _PROJECT_KEY_RE.match(project_key or ""):
        raise HTTPException(status_code=400, detail="Invalid project_key format")

    email = _get_user_email(request)

    if not _project_exists(project_key):
        raise HTTPException(status_code=404, detail="Project not found")

    if not _user_can_access_project(email, project_key):
        raise HTTPException(status_code=403, detail="Forbidden: no access to this project")

    try:
        all_issues = json_store.read("issues") or []
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load issues")

    try:
        filtered = _filter_issues(
            all_issues,
            project_id=project_key,
            status=status,
            assignee=assignee,
            priority=priority,
            issue_type=issue_type,
            sprint=sprint,
            epic=epic,
        )

        if search:
            needle = search.lower()
            filtered = [
                i for i in filtered
                if needle in (i.get("fields", {}).get("summary") or "").lower()
                or needle in (i.get("key") or "").lower()
                or needle in (i.get("fields", {}).get("description") or "").lower()
            ]
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to filter issues")

    header = ["Key", "Summary", "Issue Type", "Status", "Priority", "Assignee", "Sprint"]

    def row_for(issue: dict) -> list:
        fields = issue.get("fields", {}) or {}
        assignee_obj = fields.get("assignee") or {}
        assignee_name = assignee_obj.get("displayName") or assignee_obj.get("emailAddress") or ""
        sprint_obj = fields.get("sprint") or {}
        sprint_name = sprint_obj.get("name") or ""
        return [
            _sanitize_csv_cell(issue.get("key") or ""),
            _sanitize_csv_cell(fields.get("summary") or ""),
            _sanitize_csv_cell((fields.get("issuetype") or {}).get("name") or ""),
            _sanitize_csv_cell((fields.get("status") or {}).get("name") or ""),
            _sanitize_csv_cell((fields.get("priority") or {}).get("name") or ""),
            _sanitize_csv_cell(assignee_name),
            _sanitize_csv_cell(sprint_name),
        ]

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
        # Emit UTF-8 BOM before the header for Excel compatibility.
        writer.writerow(header)
        first = buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        yield "\ufeff" + first
        for issue in filtered:
            writer.writerow(row_for(issue))
            data = buf.getvalue()
            buf.seek(0)
            buf.truncate(0)
            yield data

    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"backlog_export_{project_key}_{date_str}.csv"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
    }
    return StreamingResponse(
        generate(),
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )
