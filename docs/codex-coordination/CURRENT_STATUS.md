# Hey City — Design Refresh Current Status

**Status date:** 2026-07-19

| Work package | Status | Evidence | Blocker / next action |
|---|---|---|---|
| Repository synchronization | Blocked | GitHub `main` differs from supplied screenshots and local line references | Push the current City Signal implementation to GitHub and record branch/SHA |
| Independent code audit | Waiting | Audit 001 completed against `main` | Re-run against the exact pushed implementation branch |
| Mobile UI architecture correction | Planned | Architecture concern confirmed from old and new evidence | Start only after repository sync |
| Explore vs Guided Tour separation | Planned | Screenshots show guided metadata leaking into Explore | Include in architecture checkpoint |
| Navigation / Story / Transcript separation | Planned | Screenshots show overlapping surfaces and controls | Include in architecture checkpoint |
| Guide Quick Preview | Backlog | Missing compact sheet | Later checkpoint |
| Approaching / At Target image fallback | Backlog | Current implementation only partially shown | Later checkpoint |
| Stories populated fixture | Backlog | Empty state only reviewed | Later checkpoint |
| Completion / Share verification | Not verified | No current GitHub-matched evidence | Review after core architecture correction |
| Driving safety UI | Not verified | No screenshots/code audit | Separate safety checkpoint |

## Current position

```text
Synchronize implementation to GitHub
→ audit exact branch and commit
→ architecture correction checkpoint
→ review tests and screenshots
→ update this status
```

## Canonical next task

`TASK_001_SYNC_CURRENT_IMPLEMENTATION.md`

Do not begin broad UI refactoring until Task 001 is complete and Audit 002 identifies the exact current component/state structure.
