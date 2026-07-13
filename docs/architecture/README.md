# Hey City Architecture Docs

This folder contains architecture reference diagrams for Hey City.

These documents are intended for:
- Founder / product review
- Codex implementation guidance
- onboarding new contributors
- keeping product, backend, mobile, and AI boundaries clear

## Recommended reading order

1. `01-system-overview.md`
2. `02-product-user-flow.md`
3. `03-drive-discovery-engine.md`
4. `04-ai-guide-brain.md`
5. `05-narrative-plan-flow.md`
6. `06-data-and-storage.md`
7. `07-mobile-architecture.md`
8. `08-backend-api-boundaries.md`
9. `09-repository-structure.md`
10. `10-provider-integration.md`

## Codex instruction

Before implementing architecture-affecting changes, read:
- `/AGENTS.md`
- `/docs/architecture/README.md`
- the specific architecture file related to the task

Codex should treat these files as implementation guidance, not immutable law. If code and docs conflict, inspect current code first, then propose a small decision note before changing architecture.
