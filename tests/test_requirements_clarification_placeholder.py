from pmtracker.placeholders.requirements_clarification import (
    PLACEHOLDER_REASON,
    UNRESOLVED_QUESTIONS,
)


def test_placeholder_reason_is_nonempty_string():
    assert isinstance(PLACEHOLDER_REASON, str) and PLACEHOLDER_REASON


def test_unresolved_questions_listed():
    assert isinstance(UNRESOLVED_QUESTIONS, list) and len(UNRESOLVED_QUESTIONS) >= 1


def test_csv_headers_importable_from_issues_route():
    from api.routes.issues import CSV_HEADERS
    assert isinstance(CSV_HEADERS, list)
    assert all(isinstance(h, str) for h in CSV_HEADERS)
    assert len(CSV_HEADERS) > 0
