## 19. Acceptance Criteria

The task is complete when all conditions below are met.

### Functional

- [ ] App can use real device GPS without a predefined route.
- [ ] Backend receives location, speed, and heading context.
- [ ] Google calls occur backend-side only.
- [ ] Provider refresh defaults to once every 60 minutes.
- [ ] Provider refresh interval is manually configurable.
- [ ] Developer can manually force refresh.
- [ ] Local target evaluation occurs between provider refreshes.
- [ ] Cities/towns/localities can appear as targets.
- [ ] Significant non-commercial attractions can appear as targets.
- [ ] Stores are excluded.
- [ ] Gas stations are excluded.
- [ ] Restaurants and similar food businesses are excluded.
- [ ] Local services and small businesses are excluded.
- [ ] Objects behind the user are excluded.
- [ ] One selected target and reasons are visible in the mobile diagnostic UI.
- [ ] Provider and filtering failures produce typed diagnostic states.

### Architecture

- [ ] Provider-specific DTOs stay inside the Google adapter.
- [ ] Deterministic filtering/scoring is provider-neutral.
- [ ] Config values are not hardcoded in discovery logic.
- [ ] No Google secrets are present in mobile code.
- [ ] Existing discovery/session architecture is reused where practical.
- [ ] No broad repository restructuring is introduced.

### Quality

- [ ] Unit tests cover geometry, filtering, scoring, refresh scheduling, and provider normalization.
- [ ] Existing relevant tests continue to pass.
- [ ] TypeScript compilation passes.
- [ ] Linting passes where configured.
- [ ] A short field-test runbook is added or updated.

---

## 20. Field-Test Runbook

Add a concise runbook under the existing demo, QA, or reports structure.

It must include:

1. required environment variables;
2. how to run backend and mobile;
3. how to enable Ahead Discovery diagnostics;
4. how to change provider refresh interval;
5. how to force manual refresh;
6. expected debug fields;
7. how to identify a target-behind error;
8. how to capture logs from a driving session;
9. known prototype limitations;
10. safety note: the driver must not interact with the device while driving.

Do not create multiple overlapping documents. Update an existing appropriate runbook when one already exists.

---

## 21. Deferred Follow-Up: Spatial Cache

**Do not implement spatial cache in TASK-005.**

Create one explicit follow-up item in the engineering backlog or completion report:

```text
FOLLOW-UP — Add shared spatial/corridor cache after Ahead Discovery field validation.
Trigger for reconsideration:
- target identification quality is acceptable in real driving;
- Google call volume and cost are measured;
- repeated requests across the same corridor are observed;
- provider refresh behavior is stable.
```

The future cache should be evaluated for:

- geohash or corridor-based keys;
- shared reuse across users;
- cache TTL by target type;
- language-independent geographic candidate caching;
- separation of raw provider results from enriched narrative content.

This follow-up is a reminder, not part of TASK-005 implementation.

---

## 22. Codex Completion Report

When implementation is complete, report:

1. summary of implemented behavior;
2. all files changed;
3. API and DTO changes;
4. config variables added;
5. Google APIs/endpoints used;
6. provider field masks used;
7. filtering and scoring rules implemented;
8. tests added and test results;
9. field-test instructions;
10. known limitations;
11. deviations from this task and reasons;
12. explicit confirmation that spatial cache, LLM, TTS, and production UI were not implemented;
13. the deferred spatial-cache follow-up item.

Do not claim field quality has been validated unless a real field test has been performed and evidence is available.

