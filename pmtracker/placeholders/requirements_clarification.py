"""Placeholder recording that no actionable requirements were provided."""
from __future__ import annotations

PLACEHOLDER_REASON: str = (
    "Requirements spec was empty; no components, endpoints, or files were designed. "
    "See unresolved_questions for Tech Lead Gate 1 review."
)

UNRESOLVED_QUESTIONS: list[str] = [
    "functional_requirements is empty — what behavior should be implemented?",
    "acceptance_criteria is empty — how will success be measured?",
    "non_functional_requirements is empty — are there perf/security/availability targets?",
]
