# Task 001 — Synchronize Current City Signal Implementation to GitHub

## Objective

Make the exact code that produced the submitted City Signal simulator screenshots available for independent review in GitHub.

This task is synchronization and evidence collection only. Do not redesign screens or begin architecture refactoring yet.

## Required actions

1. Identify the local branch/working tree that generated the latest screenshots.
2. Run and include:
   - `git branch --show-current`
   - `git rev-parse HEAD`
   - `git status --short`
   - `git log -1 --oneline`
3. Commit all relevant City Signal implementation files.
4. Push the implementation to GitHub.
5. Prefer a dedicated branch named:
   - `design-refresh/city-signal-current`
   
   If an existing pushed branch already contains the exact implementation, use it and state why.
6. Do not merge into `main` as part of this task unless explicitly instructed by the Founder.
7. Confirm that these files in GitHub match the local implementation:
   - `mobile/src/screens/LiveScreen.tsx`
   - `mobile/src/screens/HistoryScreen.tsx`
   - `mobile/src/screens/SettingsScreen.tsx`
   - navigation entry/root (`mobile/App.tsx` or current equivalent)
   - any new City Signal components, presentation selectors, theme files, assets and tests.
8. Capture fresh simulator screenshots from the pushed commit.

## Required screenshots

At minimum:

- Explore Home;
- Tour Preferences;
- Guided Tour / Navigating;
- Active Story;
- Transcript open;
- Stories;
- Settings.

Use filenames containing screen name, device and commit short SHA where practical.

## Required report

Create:

`docs/codex-coordination/REPORT_001_SYNC_CURRENT_IMPLEMENTATION.md`

Include:

### Repository evidence

- branch name;
- pushed commit SHA;
- base branch;
- `git status --short` after push;
- list of relevant commits.

### File inventory

List all City Signal files added or changed.

### Screenshot inventory

For every screenshot:

- filename/path;
- screen/state;
- device;
- language;
- commit SHA.

### Known local-only content

Explicitly list any relevant untracked, ignored or unpushed files. The expected answer is none.

### Final status

Use exactly one:

- `READY FOR CODE AUDIT`
- `NOT READY — SYNC BLOCKERS REMAIN`

## Acceptance criteria

- The GitHub branch can be fetched by repository tools.
- Reported line references resolve on the pushed branch.
- Screenshots were generated from the reported commit.
- No relevant City Signal implementation remains local-only.
- No architecture or UI behavior change is mixed into this synchronization task.
