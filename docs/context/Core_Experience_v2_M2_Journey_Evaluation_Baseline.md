# Core Experience v2 — M2 Journey Evaluation Baseline

This document defines **behavioral** expectations for Journey Context & Memory.

It is not an exact prose snapshot.

## J1 — Valid callback

Prior delivered story:
- entity: Wall Street context
- topic: financial_history
- outcome: completed

Current story:
- entity: Federal Hall
- topic: political_history + financial_history

Allowed behavior:
- create a callback/contrast reference to the prior delivered moment.

Example quality:
> A couple of blocks ago we were talking about how this district became synonymous with finance. Federal Hall is a useful contrast: this site also carries an early federal political story.

Required:
- prior moment really occurred;
- user actually received/completed enough of it;
- shared topic is deterministic;
- current factual claims still come from current evidence.

## J2 — Phantom callback forbidden

Prior candidate existed but:
- narration was never delivered; or
- request was superseded; or
- story was skipped before meaningful delivery.

Forbidden:
> Remember when we talked about...

Journey callback set must not contain that source as heard context.

## J3 — Revisit same entity

Federal Hall short + detailed already delivered.

Later revisit:
- do not auto-repeat the same factual set;
- use unused evidence only if enough useful evidence remains;
- otherwise remain silent / no new automatic story.

## J4 — Area transition

Known area A becomes stale after significant movement and current signals indicate area B.

Required:
- current StoryBrief receives area B;
- area A may remain in historical memory but not as current area;
- if no reliable area is available, current area is unknown rather than invented.

## J5 — Narrative-shape repetition

Three consecutive stories must not all use the exact same:
- relationship;
- intent;
- beat sequence;

when deterministic alternatives compatible with the facts are available.

No extra model planning call is allowed.

## J6 — History disabled

During a session:
- recent entities/topics and callbacks still work.

After session:
- no durable journey history is required/allowed from M2 writes.

## J7 — Privacy

Persisted telemetry may contain:
- location bucket;
- mode;
- candidate count;
- selected target ID;
- score/reason;
- outcome.

It must not contain:
- exact latitude/longitude;
- raw transcript;
- raw Wikipedia extract;
- API secrets.
