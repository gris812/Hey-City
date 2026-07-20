# Hey City — Design Refresh Current Status

**Status date:** 2026-07-19  
**Audited main commit:** `de206585d1fc9d96b73b056280baa0119962e30f`

| Work package | Status | Evidence | Blocker / next action |
|---|---|---|---|
| Repository synchronization | Complete | City Signal implementation present on GitHub `main` | None |
| Independent code audit | Complete | `AUDIT_002_CITY_SIGNAL_MAIN.md` | Architecture correction required |
| Mobile UI architecture correction | Ready for Codex | `TASK_002_PRESENTATION_ARCHITECTURE.md` | Execute Task 002 only |
| Explore vs Guided Tour separation | Included in Task 002 | Explore currently shows fixed route metadata | Remove leakage without fabricating guest discovery |
| Navigation / Story / Transcript separation | Included in Task 002 | Duplicate controls and overlapping surfaces confirmed | Add one foreground phase selector |
| Guide Quick Preview | Backlog — CP2 | Missing compact sheet | Start only after Task 002 review |
| Approaching / At Target image fallback | Backlog — CP2 | At Target is not a distinct state | Start only after Task 002 review |
| Stories populated fixture | Backlog — CP3 | Empty state only; semantics need cleanup | Later checkpoint |
| Completion / Share verification | Not verified — CP3 | Implemented but not independently reviewed | Review after core architecture correction |
| Driving safety UI | Not verified — CP4 | Legacy Drive branch remains; runtime model not audited | Separate safety checkpoint |
| `artur` / `arthur` compatibility | Audit required in Task 002 | Identifier migration crossed docs/mobile/contracts | Do not silently migrate |

## Current position

```text
Task 002: presentation architecture correction
→ architecture review of code/tests/screenshots
→ Task 003: guide layer + target states
→ Task 004: retention/share
→ Task 005: driving safety runtime
```

## Canonical next task

`TASK_002_PRESENTATION_ARCHITECTURE.md`

Do not add new screens or broaden Settings until Task 002 is implemented, tested and reviewed.
