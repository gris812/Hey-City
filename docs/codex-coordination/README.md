# ChatGPT ↔ Codex Coordination

This folder is the canonical exchange area for architecture review, design-refresh tasks, implementation reports, and verification evidence.

## Folder contract

- `CURRENT_STATUS.md` — current milestone, completed work, blockers, and next checkpoint.
- `TASK_XXX_*.md` — approved bounded assignments for Codex.
- `REPORT_XXX_*.md` — Codex implementation reports for the matching task.
- `AUDIT_*.md` — independent architecture/design audits.
- `evidence/` — screenshot manifests or links committed by Codex when practical.

## Workflow

1. ChatGPT creates or updates an approved `TASK_XXX` file.
2. Codex implements only that task scope.
3. Codex adds `REPORT_XXX` with files changed, tests, regressions, screenshots and known deviations.
4. ChatGPT reviews repository changes and evidence.
5. `CURRENT_STATUS.md` is updated only after review.

## Rules

- Existing working behavior must be preserved unless a task explicitly changes it.
- Architectural decisions are not invented during implementation.
- Each task must be small enough to review independently.
- A task is not complete without test output and fresh screenshots.
- Screenshots must identify device, language and represented UI state.
- Codex must state `READY FOR REVIEW` or `NOT READY — BLOCKERS REMAIN`.

## Important repository sync rule

The GitHub branch being reviewed must contain the same code that produced the submitted simulator screenshots. Local-only implementation cannot be audited through GitHub and must be pushed before review.
