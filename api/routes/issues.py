"""Issues routes including backlog CSV export."""
from __future__ import annotations

import csv
import io
import logging
import re
from typing import Iterable, Iterator

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

try:
    from api.routes.auth import get_current_user  # type: ignore
except Exception:  # pragma: no cover - fallback when auth module shape differs
    get_current_user = None  # type: ignore

try:
    from api.routes.assignments import get_user_project_keys  # type: ignore
except Exception:  # pragma: no cover
    def get_user_project_keys(_email: str) -> list[str]:
        return []

try:
    from pmtracker import api_client  # type: ignore
except Exception:  # pragma: no cover
    api_client = None  # type: ignore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/issues", tags=["issues"])

PROJECT_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]+$")

CSV_HEADERS = [
    "key",
    "summary",
    "issue_type",
    "status",
    "priority",
    "assignee",
    "sprint",
]

_FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")


def _safe_str(value) -> str:
    """Return str(value) with empty for None, sanitizing formula-injection chars."""
    if value is None:
        return ""
    s = str(value)
    if s and s[0] in _FORMULA_TRIGGERS:
        return "'" + s
    return s


def _extract_field(item, *names):
    """Fetch first present attribute/key from an item-like object."""
    for name in names:
        if isinstance(item, dict):
            if name in item and item[name] is not None:
                return item[name]
        else:
            val = getattr(item, name, None)
            if val is not None:
                return val
    return None


def _item_project_key(item) -> str:
    """Derive project key from an item (e.g. PROJ-123 -> PROJ) or explicit field."""
    proj = _extract_field(item, "project_key", "project")
    if proj:
        return str(proj)
    key = _extract_field(item, "key", "issue_key", "id")
    if key and isinstance(key, str) and "-" in key:
        return key.split("-", 1)[0]
    return ""


def _assignee_str(item) -> str:
    val = _extract_field(item, "assignee", "assignee_email", "assignee_name")
    if val is None:
        return ""
    if isinstance(val, dict):
        return _safe_str(val.get("display_name") or val.get("email") or val.get("name") or "")
    return _safe_str(val)


def _sprint_str(item) -> str:
    val = _extract_field(item, "sprint", "sprint_name", "sprint_id")
    if val is None:
        return ""
    if isinstance(val, dict):
        return _safe_str(val.get("name") or val.get("id") or "")
    return _safe_str(val)


def _fetch_items(
    project_key: str | None,
    status: str | None,
    issue_type: str | None,
    assignee: str | None,
    sprint_id: str | None,
    labels: str | None,
) -> Iterable:
    """Fetch backlog items using api_client, with defensive fallbacks."""
    if api_client is None:
        return []
    filters = {
        "project_key": project_key,
        "status": status,
        "issue_type": issue_type,
        "assignee": assignee,
        "sprint_id": sprint_id,
        "labels": labels,
    }
    filters = {k: v for k, v in filters.items() if v is not None}
    for fn_name in ("list_issues", "list_backlog", "get_issues"):
        fn = getattr(api_client, fn_name, None)
        if callable(fn):
            try:
                return fn(**filters)
            except TypeError:
                return fn(filters)
    return []


def _resolve_user(request: Request):
    """Resolve current user via dependency if available; else enforce bearer presence."""
    if get_current_user is not None:
        return None  # handled via Depends
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"email": None}


if get_current_user is not None:
    _user_dep = Depends(get_current_user)
else:
    _user_dep = Depends(_resolve_user)


@router.get("/export")
def export_backlog_csv(
    request: Request,
    project_key: str | None = Query(default=None),
    status: str | None = Query(default=None),
    issue_type: str | None = Query(default=None),
    assignee: str | None = Query(default=None),
    sprint_id: str | None = Query(default=None),
    labels: str | None = Query(default=None),
    current_user=_user_dep,
) -> StreamingResponse:
    """Stream backlog items as CSV (text/csv; charset=utf-8) with UTF-8 BOM."""
    if project_key is not None and not PROJECT_KEY_RE.match(project_key):
        raise HTTPException(status_code=400, detail="Invalid project_key format")

    user_email = ""
    is_admin = False
    if isinstance(current_user, dict):
        user_email = current_user.get("email") or ""
        is_admin = bool(current_user.get("is_admin", False))
    elif current_user is not None:
        user_email = getattr(current_user, "email", "") or ""
        is_admin = bool(getattr(current_user, "is_admin", False))

    allowed_projects: set[str] | None = None
    if not is_admin:
        try:
            allowed = get_user_project_keys(user_email) if user_email else []
        except Exception:
            allowed = []
        allowed_projects = set(allowed or [])
        if project_key and allowed_projects and project_key not in allowed_projects:
            raise HTTPException(status_code=403, detail="Forbidden")

    try:
        items = _fetch_items(project_key, status, issue_type, assignee, sprint_id, labels)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to load backlog for export")
        raise HTTPException(status_code=500, detail="Failed to load backlog")

    def row_iter() -> Iterator[bytes]:
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\r\n")
        # UTF-8 BOM for Excel compatibility
        yield b"\xef\xbb\xbf"
        writer.writerow(CSV_HEADERS)
        data = buf.getvalue().encode("utf-8")
        buf.seek(0)
        buf.truncate(0)
        yield data

        try:
            for item in items or []:
                row_proj = _item_project_key(item)
                # Fail-closed authorization: non-admins only see allowed projects
                if allowed_projects is not None:
                    if not row_proj or row_proj not in allowed_projects:
                        continue
                # Honor explicit project_key filter server-side (applies to all callers)
                if project_key and row_proj and row_proj != project_key:
                    continue
                writer.writerow([
                    _safe_str(_extract_field(item, "key", "issue_key", "id")),
                    _safe_str(_extract_field(item, "summary", "title")),
                    _safe_str(_extract_field(item, "issue_type", "type")),
                    _safe_str(_extract_field(item, "status", "state")),
                    _safe_str(_extract_field(item, "priority")),
                    _assignee_str(item),
                    _sprint_str(item),
                ])
                data = buf.getvalue().encode("utf-8")
                buf.seek(0)
                buf.truncate(0)
                if data:
                    yield data
        except Exception:
            logger.exception("Error while streaming backlog CSV")
            raise

    headers = {
        "Content-Disposition": "attachment; filename=backlog_export.csv",
        "Cache-Control": "no-store",
    }
    return StreamingResponse(
        row_iter(),
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )
