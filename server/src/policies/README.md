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

## Good future candidates

These are intentionally **not** moved in the callback refactor because they deserve separate regression-safe changes:

1. **Discovery taxonomy policy**
   - current locations: `services/aheadDiscoveryFiltering.ts` and `config.ts:placeTypes`.
   - Google type mapping, deny/allow categories, and cultural exceptions currently have overlapping definitions and should have one canonical taxonomy.

2. **Discovery category/ranking policy**
   - current location: `services/aheadDiscoveryScoring.ts` category priorities and popularity composition.
   - category priorities are product choices and should be separated from the scoring algorithm.

Operational numbers such as cache TTLs, timeouts, memory caps, cooldown seconds and provider rate limits should normally remain in `config.ts` / environment configuration rather than move into product-policy files.
