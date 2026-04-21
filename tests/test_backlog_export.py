"""Test stubs for GET /api/issues/backlog/export."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from api.main import app
    return TestClient(app)


def test_export_unauthenticated_returns_401(client):
    res = client.get("/api/issues/backlog/export")
    assert res.status_code in (401, 403)


def test_export_happy_path_returns_csv_with_header(client, monkeypatch):
    # Happy path: authenticated call returns text/csv with expected header row and attachment disposition
    pass


def test_export_invalid_project_key_returns_400(client, monkeypatch):
    # Boundary: malformed project_key query should yield 400
    pass


def test_export_filters_match_list_endpoint(client, monkeypatch):
    # Filter semantics must mirror _filter_issues used by list endpoint
    pass


def test_export_streams_via_generator(client, monkeypatch):
    # NFR: response body is produced by a generator (StreamingResponse)
    pass


def test_export_forbidden_for_unassigned_project(client, monkeypatch):
    # AuthZ: user not assigned to project_key gets 403
    pass


def test_export_sanitizes_formula_injection(client, monkeypatch):
    # Security: leading =, +, -, @ in summary must be neutralized
    pass
