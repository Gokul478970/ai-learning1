"""Tests to verify Export CSV button removal from Backlog page.

These tests verify the source code of ui/src/pages/Backlog.tsx to confirm
that the Export CSV button has been removed while the Import CSV button
is preserved.
"""
import os
import re


def _read_backlog_tsx():
    """Read the Backlog.tsx source file."""
    # Navigate from test location to the Backlog.tsx file
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    backlog_path = os.path.join(base_dir, 'pages', 'Backlog.tsx')
    with open(backlog_path, 'r', encoding='utf-8') as f:
        return f.read()


def test_export_csv_button_not_present():
    """Given a user opens the Product Backlog page, when the page loads,
    then an Export CSV button is not displayed."""
    content = _read_backlog_tsx()
    # The text 'Export CSV' should not appear as button text in the JSX
    assert 'Export CSV' not in content, (
        'Export CSV button text should not be present in Backlog.tsx'
    )


def test_import_csv_button_still_present():
    """Given a user opens the Product Backlog page, when the page loads,
    then the Import CSV button is still displayed and remains usable."""
    content = _read_backlog_tsx()
    assert 'Import CSV' in content, (
        'Import CSV button text must still be present in Backlog.tsx'
    )


def test_import_csv_dialog_still_imported():
    """The ImportCsvDialog component should still be imported and used."""
    content = _read_backlog_tsx()
    assert 'ImportCsvDialog' in content, (
        'ImportCsvDialog import must still be present in Backlog.tsx'
    )


def test_file_up_icon_still_imported():
    """The FileUp icon used by Import CSV button should still be imported."""
    content = _read_backlog_tsx()
    assert 'FileUp' in content, (
        'FileUp icon import must still be present for Import CSV button'
    )


def test_no_new_dependencies_added():
    """Given the implementation is completed, when project dependencies
    are reviewed, then no new dependencies have been added."""
    content = _read_backlog_tsx()
    # Verify we only import from the same known modules as before
    import_lines = [line for line in content.split('\n') if line.strip().startswith('import ')]
    known_sources = [
        'react', 'react-router-dom', '@tanstack/react-query',
        '@/lib/api', '@/components/CreateIssueDialog',
        '@/components/ImportCsvDialog', '@/lib/auth', '@/lib/utils',
        'lucide-react',
    ]
    for line in import_lines:
        # Extract the module path from the import statement
        match = re.search(r"from ['\"]([^'\"]+)['\"]", line)
        if match:
            module = match.group(1)
            assert module in known_sources, (
                f'Unexpected import source found: {module}'
            )
