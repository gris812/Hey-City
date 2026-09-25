# Product policy modules

This directory contains **mutable product policy**: deterministic rules that may evolve as Hey City is tuned, but are not infrastructure/runtime configuration and are not service algorithms.

Use this split:

- `config.ts` — environment/runtime values, limits, timeouts, provider credentials and operational thresholds.
- `src/policies/` — product rules and taxonomies that product/experience work is expected to tune over time.
- `src/services/` — algorithms/orchestration that consume policy.
- canonical docs — why the policy exists and its architectural constraints.

A policy module must remain deterministic and provider-independent. Moving a rule here must not transfer product authority to an LLM.

## Current

- `callbackTopicPolicy.ts` — evidence-backed callback topic catalog and matching rules.
- `guideNarrativePolicy.ts` — Dana/Arthur aliases, common guide constraints, persona behavior and preferred beat sequences.
- `narrativeQualityPolicy.ts` — forbidden spoken openings/CTAs, beat objectives, deterministic beat variants and narrative angles.
- `discoveryTaxonomyPolicy.ts` — ordered provider-type mapping, Ahead Discovery deny/cultural exceptions, narrative target categories, and compatibility taxonomy for legacy Nearby Places.
- `discoveryRankingPolicy.ts` — category priorities and popularity interpretation weights/caps.

## Discovery compatibility note

Ahead Discovery and the older Nearby Places pipeline previously used overlapping but non-equivalent type catalogs. Ahead Discovery allows a cultural exception such as `museum + store`; legacy Nearby Places rejects any forbidden tag and also supports legacy-only categories such as `church` and `library`. Both rules now live explicitly in `discoveryTaxonomyPolicy.ts`; their runtime behavior remains separate and unchanged.

Operational numbers such as cache TTLs, timeouts, memory caps, cooldown seconds and provider rate limits should normally remain in `config.ts` / environment configuration rather than move into product-policy files.
