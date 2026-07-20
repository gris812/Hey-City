# Hey City — MVP User Flow Status v1

**Current milestone:** Mobile presentation architecture correction  
**Status owner:** ChatGPT architecture review + Codex implementation

| # | User stage | Canonical screen/state | Required functions | Current status | Next checkpoint |
|---:|---|---|---|---|---|
| 1 | Open app | Explore Home | Current area, Explore/Guided selector, guide identity, ambient status, primary CTA | Partial — fixed Guided Tour metadata leaks into Explore | CP1 |
| 2 | Select Guided Tour | Tour Preferences | Guide, optional 1–3 interests, language, route summary, Start Walk | Implemented — retain | CP1 regression only |
| 3 | Quick guide details | Guide Quick Preview | Role, 2-line description, suggested interests, Full Profile, Choose | Missing | CP2 |
| 4 | Full guide profile | Guide Profile | Full image, role, description, tags, sample, choose/back | Implemented | CP1 regression only |
| 5 | Start tour | Guided Navigation | Route, location, next stop, progress, safe pause/transcript/end | Partial — duplicate control systems | CP1 |
| 6 | Approach target | Approaching | Target emphasis, distance/context, reduced-motion fallback | Partial — only approach text box | CP2 |
| 7 | Arrive | At Target | POI image or fallback, guide, story start | Missing as distinct state | CP2 |
| 8 | Listen | Active Story | Audio-first controls, short preview, map context | Partial — competes with navigation card | CP1 |
| 9 | Read | Transcript | Full transcript, accessible scroll, close/restore | Partial — transparent over crowded content | CP1 |
| 10 | Story finished | Story Complete | Continue, Skip, End after current/next stop | Partial — waiting state exists but not isolated | CP2 |
| 11 | Tour finished | Tour Complete | Summary, Save City Story, Share Route, guest value first | Implemented; not yet independently reviewed | CP3 |
| 12 | View history | Your City Stories | Real cards, empty state, guest behavior | Partial — empty state semantics misleading | CP3 |
| 13 | Open shared tour | Share Preview | Route, stops, guide, attribution, Start Tour, Preview | Implemented; not yet independently reviewed | CP3 |
| 14 | Configure defaults | Settings | Account, guide/interests, language, audio/text, privacy | Partial — interests absent from Guide & Interests section | CP2/3 |
| 15 | Movement changes | Driving runtime state | Automatic safety state, minimal UI, large controls | Legacy branch exists; automatic runtime model not verified | CP4 |

## Current position

```text
CP1: architecture correction
→ CP2: guide layer + target states
→ CP3: retention/share surfaces
→ CP4: driving safety runtime
```

## Checkpoint completion rule

A checkpoint is complete only when Codex provides:

- commit SHA;
- clean working tree confirmation;
- test commands and results;
- fresh simulator screenshots for every modified state;
- implementation report under `docs/codex-coordination/`;
- no unresolved blocking regression.
