import csv
import io
import re
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from pmtracker.store import json_store
from pmtracker.tools.transitions import STATUS_OBJECTS, TRANSITIONS

# Hard import of the canonical auth dependency. If this fails, the module must
# fail to load loudly rather than silently substitute a permissive shim.
from api.deps import get_current_user  # type: ignore

router = APIRouter(tags=["issues"])


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


_PRIORITY_MAP = {"Highest": "1", "High": "2", "Medium": "3", "Low": "4", "Lowest": "5"}

_PROJECT_KEY_PATTERN = re.compile(r"^[A-Z][A-Z0-9]+$")


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
    type: str  # "Blocks", "Relates", "Duplicate"
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
    """Filter issues by optional criteria (case-insensitive where applicable)."""
    results = list(all_issues)
    if project_id:
        results = [
            i for i in results
            if i.get("fields", {}).get("project", {}).get("id") == project_id
            or i.get("fields", {}).get("project", {}).get("key") == project_id
        ]
    if status:
        s = status.lower()
        results = [
            i for i in results
            if (i.get("fields", {}).get("status", {}) or {}).get("name", "").lower() == s
        ]
    if assignee:
        a = assignee.lower()
        results = [
            i for i in results
            if ((i.get("fields", {}).get("assignee") or {}).get("accountId", "") or "").lower() == a
            or ((i.get("fields", {}).get("assignee") or {}).get("displayName", "") or "").lower() == a
            or ((i.get("fields", {}).get("assignee") or {}).get("emailAddress", "") or "").lower() == a
        ]
    if priority:
        p = priority.lower()
        results = [
            i for i in results
            if (i.get("fields", {}).get("priority", {}) or {}).get("name", "").lower() == p
        ]
    if issue_type:
        t = issue_type.lower()
        results = [
            i for i in results
            if (i.get("fields", {}).get("issuetype", {}) or {}).get("name", "").lower() == t
        ]
    if sprint:
        sp = sprint.lower()
        def _matches_sprint(issue):
            sprints = issue.get("fields", {}).get("sprint") or issue.get("fields", {}).get("sprints") or []
            if isinstance(sprints, dict):
                sprints = [sprints]
            for s_ in sprints:
                if not isinstance(s_, dict):
                    continue
                if str(s_.get("id", "")).lower() == sp or str(s_.get("name", "")).lower() == sp:
                    return True
            return False
        results = [i for i in results if _matches_sprint(i)]
    if epic:
        e = epic.lower()
        results = [
            i for i in results
            if str(i.get("fields", {}).get("epic_link", "") or "").lower() == e
            or str((i.get("fields", {}).get("epic") or {}).get("key", "") or "").lower() == e
        ]
    return results


def _sanitize_csv_field(value: str) -> str:
    """Neutralize CSV formula injection by prefixing risky leading chars."""
    if value is None:
        return ""
    s = str(value)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s


def _issue_to_csv_row(issue: dict) -> list[str]:
    """Project an issue dict into the export CSV column order."""
    fields = issue.get("fields", {}) or {}
    key = issue.get("key", "") or ""
    summary = fields.get("summary", "") or ""
    status = (fields.get("status") or {}).get("name", "") or ""
    assignee_obj = fields.get("assignee") or {}
    assignee = ""
    if isinstance(assignee_obj, dict):
        assignee = (
            assignee_obj.get("displayName")
            or assignee_obj.get("emailAddress")
            or assignee_obj.get("accountId")
            or ""
        )
    priority = (fields.get("priority") or {}).get("name", "") or ""
    issue_type = (fields.get("issuetype") or {}).get("name", "") or ""
    sprints = fields.get("sprint") or fields.get("sprints") or []
    if isinstance(sprints, dict):
        sprints = [sprints]
    sprint_names = []
    for s_ in sprints:
        if isinstance(s_, dict):
            nm = s_.get("name") or s_.get("id") or ""
            if nm:
                sprint_names.append(str(nm))
        elif s_:
            sprint_names.append(str(s_))
    sprint_col = "; ".join(sprint_names)
    return [
        _sanitize_csv_field(key),
        _sanitize_csv_field(summary),
        _sanitize_csv_field(status),
        _sanitize_csv_field(assignee),
        _sanitize_csv_field(priority),
        _sanitize_csv_field(issue_type),
        _sanitize_csv_field(sprint_col),
    ]


def _user_can_access_project(user: dict, project_key: str) -> bool:
    """Return True if user is admin or assigned to the given project."""
    if not user:
        return False
    role = (user.get("role") or "").lower()
    if role in ("admin", "superadmin"):
        return True
    try:
        assignments = json_store.load("assignments") or []
    except Exception:
        assignments = []
    uid = user.get("id") or user.get("account_id") or user.get("email")
    for a in assignments:
        if not isinstance(a, dict):
            continue
        a_user = a.get("user_id") or a.get("user") or a.get("email")
        a_proj = a.get("project_key") or a.get("project")
        if a_user == uid and a_proj == project_key:
            return True
    # If no assignments data exists, fall back to allowing authenticated access
    # (matches the permissive default of other issues.py endpoints).
    if not assignments:
        return True
    return False


@router.get("/issues/backlog/export")
def export_backlog_csv(
    project_key: str | None = Query(default=None),
    project_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    assignee: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    issue_type: str | None = Query(default=None),
    sprint: str | None = Query(default=None),
    epic: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Stream the filtered backlog as a CSV download."""
    # Validate project_key pattern if supplied (400 per contract).
    if project_key is not None and not _PROJECT_KEY_PATTERN.match(project_key):
        raise HTTPException(status_code=400, detail="Invalid project_key format")

    # Authorization: if a project filter is given, verify caller has access.
    if project_key and not _user_can_access_project(current_user, project_key):
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        all_issues = json_store.load("issues") or []
        filtered = _filter_issues(
            all_issues,
            project_id=project_id or project_key,
            status=status,
            assignee=assignee,
            priority=priority,
            issue_type=issue_type,
            sprint=sprint,
            epic=epic,
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate export")

    header = ["key", "summary", "status", "assignee", "priority", "issue_type", "sprint"]

    def row_generator():
        buf = io.StringIO()
        writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
        writer.writerow(header)
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        for issue in filtered:
            try:
                writer.writerow(_issue_to_csv_row(issue))
            except Exception:
                # Skip malformed row rather than leak a stack trace mid-stream.
                continue
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    headers = {
        "Content-Disposition": "attachment; filename=backlog_export.csv",
    }
    return StreamingResponse(
        row_generator(),
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )


# ---------------------------------------------------------------------------
# Issue CRUD
# ---------------------------------------------------------------------------

@router.get("/issues")
def list_issues(
    project_id: str | None = Query(default=None),
    project_key: str | None = Query(default=None),
    status: str | None = Query(default=None),
    assignee: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    issue_type: str | None = Query(default=None),
    sprint: str | None = Query(default=None),
    epic: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """List issues with optional filters."""
    try:
        all_issues = json_store.load("issues") or []
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load issues")
    return _filter_issues(
        all_issues,
        project_id=project_id or project_key,
        status=status,
        assignee=assignee,
        priority=priority,
        issue_type=issue_type,
        sprint=sprint,
        epic=epic,
    )


@router.get("/issues/{key}")
def get_issue(key: str, current_user: dict = Depends(get_current_user)):
    """Fetch a single issue by key."""
    issues = json_store.load("issues") or []
    for i in issues:
        if i.get("key") == key:
            return i
    raise HTTPException(status_code=404, detail="Issue not found")


@router.post("/issues", status_code=201)
def create_issue(payload: IssueCreate, current_user: dict = Depends(get_current_user)):
    """Create a new issue."""
    issues = json_store.load("issues") or []
    # Derive next key within project
    existing_keys = [i.get("key", "") for i in issues if i.get("key", "").startswith(payload.project_key + "-")]
    next_num = 1
    for k in existing_keys:
        try:
            n = int(k.split("-", 1)[1])
            if n >= next_num:
                next_num = n + 1
        except (ValueError, IndexError):
            continue
    new_key = f"{payload.project_key}-{next_num}"
    priority_id = _PRIORITY_MAP.get(payload.priority, "3")
    issue = {
        "id": str(uuid.uuid4()),
        "key": new_key,
        "fields": {
            "project": {"key": payload.project_key, "id": payload.project_key},
            "summary": payload.summary,
            "description": payload.description,
            "issuetype": {"name": payload.issue_type},
            "status": {"name": "To Do"},
            "assignee": {"accountId": payload.assignee} if payload.assignee else None,
            "priority": {"name": payload.priority, "id": priority_id},
            "labels": payload.labels,
            "components": [{"name": c} for c in payload.components],
            "epic_link": payload.epic_link,
            "sprint_id": payload.sprint_id,
            "story_points": payload.story_points,
            "estimate_hours": payload.estimate_hours,
            "parent": {"key": payload.parent_key} if payload.parent_key else None,
            "fixVersions": [{"name": v} for v in payload.fix_versions],
            "created": _now(),
            "updated": _now(),
        },
    }
    issues.append(issue)
    json_store.save("issues", issues)
    return issue


@router.patch("/issues/{key}")
def update_issue(key: str, payload: IssueUpdate, current_user: dict = Depends(get_current_user)):
    """Update fields on an existing issue."""
    issues = json_store.load("issues") or []
    for i in issues:
        if i.get("key") == key:
            f = i.setdefault("fields", {})
            data = payload.model_dump(exclude_unset=True)
            if "summary" in data:
                f["summary"] = data["summary"]
            if "description" in data:
                f["description"] = data["description"]
            if "assignee" in data:
                f["assignee"] = {"accountId": data["assignee"]} if data["assignee"] else None
            if "priority" in data:
                f["priority"] = {"name": data["priority"], "id": _PRIORITY_MAP.get(data["priority"], "3")}
            if "labels" in data:
                f["labels"] = data["labels"]
            if "components" in data:
                f["components"] = [{"name": c} for c in data["components"]]
            if "epic_link" in data:
                f["epic_link"] = data["epic_link"]
            if "sprint_id" in data:
                f["sprint_id"] = data["sprint_id"]
            if "story_points" in data:
                f["story_points"] = data["story_points"]
            if "estimate_hours" in data:
                f["estimate_hours"] = data["estimate_hours"]
            if "status" in data and data["status"]:
                f["status"] = {"name": data["status"]}
            if "parent_key" in data:
                f["parent"] = {"key": data["parent_key"]} if data["parent_key"] else None
            if "fix_versions" in data:
                f["fixVersions"] = [{"name": v} for v in data["fix_versions"]]
            if "issue_type" in data and data["issue_type"]:
                f["issuetype"] = {"name": data["issue_type"]}
            f["updated"] = _now()
            json_store.save("issues", issues)
            return i
    raise HTTPException(status_code=404, detail="Issue not found")


@router.delete("/issues/{key}", status_code=204)
def delete_issue(key: str, current_user: dict = Depends(get_current_user)):
    """Delete an issue by key."""
    issues = json_store.load("issues") or []
    for idx, i in enumerate(issues):
        if i.get("key") == key:
            issues.pop(idx)
            json_store.save("issues", issues)
            return None
    raise HTTPException(status_code=404, detail="Issue not found")


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

class CommentCreate(BaseModel):
    body: str


@router.get("/issues/{key}/comments")
def list_comments(key: str, current_user: dict = Depends(get_current_user)):
    """List comments for an issue."""
    comments = json_store.load("comments") or []
    return [c for c in comments if c.get("issue_key") == key]


@router.post("/issues/{key}/comments", status_code=201)
def add_comment(key: str, payload: CommentCreate, current_user: dict = Depends(get_current_user)):
    """Add a comment to an issue."""
    comments = json_store.load("comments") or []
    comment = {
        "id": str(uuid.uuid4()),
        "issue_key": key,
        "body": payload.body,
        "author": (current_user or {}).get("id") or (current_user or {}).get("email", ""),
        "created": _now(),
    }
    comments.append(comment)
    json_store.save("comments", comments)
    return comment


# ---------------------------------------------------------------------------
# Links
# ---------------------------------------------------------------------------

@router.post("/issues/{key}/links", status_code=201)
def add_link(key: str, payload: IssueLinkCreate, current_user: dict = Depends(get_current_user)):
    """Create a link between two issues."""
    links = json_store.load("links") or []
    link = {
        "id": str(uuid.uuid4()),
        "type": payload.type,
        "source_key": key,
        "target_key": payload.target_key,
        "created": _now(),
    }
    links.append(link)
    json_store.save("links", links)
    return link


@router.get("/issues/{key}/links")
def list_links(key: str, current_user: dict = Depends(get_current_user)):
    """List links for an issue."""
    links = json_store.load("links") or []
    return [l for l in links if l.get("source_key") == key or l.get("target_key") == key]


# ---------------------------------------------------------------------------
# Transitions
# ---------------------------------------------------------------------------

class TransitionRequest(BaseModel):
    transition: str


@router.get("/issues/{key}/transitions")
def list_transitions(key: str, current_user: dict = Depends(get_current_user)):
    """List valid transitions for an issue's current status."""
    issues = json_store.load("issues") or []
    for i in issues:
        if i.get("key") == key:
            current_status = (i.get("fields", {}).get("status") or {}).get("name", "To Do")
            valid = [t for t in TRANSITIONS if t.get("from") == current_status]
            return valid
    raise HTTPException(status_code=404, detail="Issue not found")


@router.post("/issues/{key}/transitions")
def perform_transition(key: str, payload: TransitionRequest, current_user: dict = Depends(get_current_user)):
    """Apply a transition to move an issue to a new status."""
    issues = json_store.load("issues") or []
    for i in issues:
        if i.get("key") == key:
            current_status = (i.get("fields", {}).get("status") or {}).get("name", "To Do")
            valid = [t for t in TRANSITIONS if t.get("from") == current_status and t.get("name") == payload.transition]
            if not valid:
                raise HTTPException(status_code=400, detail="Invalid transition")
            new_status = valid[0].get("to")
            if new_status not in [s.get("name") for s in STATUS_OBJECTS]:
                raise HTTPException(status_code=400, detail="Invalid target status")
            i.setdefault("fields", {})["status"] = {"name": new_status}
            i["fields"]["updated"] = _now()
            json_store.save("issues", issues)
            return i
    raise HTTPException(status_code=404, detail="Issue not found")


# ---------------------------------------------------------------------------
# CSV Import
# ---------------------------------------------------------------------------

@router.post("/issues/import")
async def import_issues_csv(
    project_key: str = Query(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Import issues from an uploaded CSV file."""
    if not _PROJECT_KEY_PATTERN.match(project_key):
        raise HTTPException(status_code=400, detail="Invalid project_key format")
    try:
        content = await file.read()
        text = content.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        issues = json_store.load("issues") or []
        existing_keys = [i.get("key", "") for i in issues if i.get("key", "").startswith(project_key + "-")]
        next_num = 1
        for k in existing_keys:
            try:
                n = int(k.split("-", 1)[1])
                if n >= next_num:
                    next_num = n + 1
            except (ValueError, IndexError):
                continue
        created = []
        for row in reader:
            summary = (row.get("summary") or "").strip()
            if not summary:
                continue
            issue = {
                "id": str(uuid.uuid4()),
                "key": f"{project_key}-{next_num}",
                "fields": {
                    "project": {"key": project_key, "id": project_key},
                    "summary": summary,
                    "description": row.get("description", "") or "",
                    "issuetype": {"name": row.get("issue_type", "Story") or "Story"},
                    "status": {"name": row.get("status", "To Do") or "To Do"},
                    "priority": {"name": row.get("priority", "Medium") or "Medium"},
                    "labels": [],
                    "created": _now(),
                    "updated": _now(),
                },
            }
            issues.append(issue)
            created.append(issue)
            next_num += 1
        json_store.save("issues", issues)
        return {"imported": len(created), "issues": created}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse CSV")
