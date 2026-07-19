# Audit 001 — GitHub Sync and Mobile UI Architecture

**Date:** 2026-07-19  
**Repository:** `gris812/Hey-City`  
**Reviewed branch:** `main`

## Executive finding

The code currently visible on GitHub `main` does **not** match the simulator screenshots and line references supplied in the implementation audit.

Examples:

- GitHub `main` `mobile/src/screens/LiveScreen.tsx` is approximately 425 lines and still presents `City Explorer` / `Drive Discovery`; the supplied audit references City Signal screens around lines 563–1097.
- GitHub `main` `HistoryScreen.tsx` is a 62-line dark prototype, while the supplied screenshot shows the new `Your City Stories` screen.
- GitHub `main` `App.tsx` still exposes four tabs: `Live`, `Map`, `History`, `Settings`; the supplied screenshots show `Explore`, `Stories`, `Settings`.

Therefore the current City Signal implementation is local-only, on another branch, or not pushed.

## Consequence

A reliable architecture/code audit cannot proceed until the exact code that generated the screenshots is available in GitHub.

No further implementation task should be accepted as complete based only on local paths and screenshots.

## Architecture finding from GitHub main

Even the older `LiveScreen.tsx` already combines:

- product mode state;
- session lifecycle;
- GPS polling;
- backend pings;
- playback state;
- settings/preferences;
- UI rendering.

This validates the concern that continuing to add City Signal surfaces inside one screen will increase coupling.

## Required correction

1. Push the current working implementation to a named branch.
2. Record the branch and commit SHA in `CURRENT_STATUS.md`.
3. Ensure screenshots are captured from that commit.
4. Run Audit 002 against the pushed branch.
5. Only then implement the bounded architecture-correction checkpoint.

## Required branch evidence

Codex must report:

- branch name;
- commit SHA;
- `git status --short` output;
- confirmation that no relevant untracked files remain;
- screenshot filenames generated from that commit.

## Status

`BLOCKED — CURRENT IMPLEMENTATION NOT AVAILABLE ON REVIEWED GITHUB BRANCH`
