"""Tests to verify Export CSV button removal from Backlog page.

These tests validate the source code of Backlog.tsx to confirm
the Export CSV button has been removed while Import CSV remains.
"""
import os
import re


def _read_backlog_tsx():
    """Read the Backlog.tsx file content."""
    # Try multiple possible paths relative to project root
    candidates = [
        os.path.join(os.path.dirname(__file__), '..', 'pages', 'Backlog.tsx'),
        os.path.join(os.path.dirname(__file__), '..', '..', 'ui', 'src', 'pages', 'Backlog.tsx'),
        os.path.join('ui', 'src', 'pages', 'Backlog.tsx'),
    ]
    for path in candidates:
        abs_path = os.path.abspath(path)
        if os.path.exists(abs_path):
            with open(abs_path, 'r', encoding='utf-8') as f:
                return f.read()
    raise FileNotFoundError(
        f"Could not find Backlog.tsx in any of: {[os.path.abspath(p) for p in candidates]}"
    )


def test_export_csv_button_not_present():
    """Given the updated Backlog.tsx, the text 'Export CSV' should not appear as button text."""
    content = _read_backlog_tsx()
    # Ensure no button with Export CSV text exists
    assert 'Export CSV' not in content, (
        "The 'Export CSV' text should have been removed from Backlog.tsx"
    )


def test_import_csv_button_still_present():
    """Given the updated Backlog.tsx, the Import CSV button must still be rendered."""
    content = _read_backlog_tsx()
    assert 'Import CSV' in content, (
        "The 'Import CSV' button text must remain in Backlog.tsx"
    )


def test_import_csv_dialog_import_exists():
    """The ImportCsvDialog import should still be present in Backlog.tsx."""
    content = _read_backlog_tsx()
    assert 'ImportCsvDialog' in content, (
        "ImportCsvDialog import must remain in Backlog.tsx"
    )


def test_file_up_icon_still_imported():
    """FileUp icon (used by Import CSV button) should still be imported."""
    content = _read_backlog_tsx()
    assert 'FileUp' in content, (
        "FileUp icon import must remain in Backlog.tsx for the Import CSV button"
    )


def test_no_download_or_export_handler():
    """There should be no export CSV handler or download reference for CSV export."""
    content = _read_backlog_tsx()
    # Check for common export-related patterns that should not exist
    assert 'exportCsv' not in content.lower().replace('_', '').replace('-', ''), (
        "No export CSV handler should remain in Backlog.tsx"
    )
    # FileDown icon should not be imported (it would only be used for export)
    assert 'FileDown' not in content, (
        "FileDown icon should not be imported since Export CSV button was removed"
    )
