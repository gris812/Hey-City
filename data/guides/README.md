# Guide profile data

The JSON files in this directory are retained as **legacy/reference profile data**.

They are **not** the production runtime guide catalogue for Core Experience v2 and must not be imported into the narrative path simply because they contain richer persona text.

Current runtime guide identity/display/voice is managed through `server/src/services/guides.ts`, seeded from `server/src/services/guideSeeds.json` and, when enabled, persisted in the guides database table.

Core Experience v2 runtime storytelling behavior is governed by the canonical Core Experience documents and the typed `GuidePolicy` introduced by Milestone 1.

If these legacy JSON profiles are synchronized or retired later, do so in a dedicated content cleanup rather than silently changing runtime behavior.
