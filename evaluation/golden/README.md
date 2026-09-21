# Narrative Engine v2 evaluation

`narrative-v2.json` encodes the M1 Golden Corpus as traits and prohibitions, not exact prose snapshots.

Automated contract and deterministic QA run with:

```bash
npm run test:m1 --workspace server
```

Live experience QA requires an explicitly supplied `OPENAI_API_KEY` and runs with:

```bash
npm run evaluate:m1 --workspace server
```

The live runner evaluates Federal Hall with Dana and Arthur, Dana short-to-detailed continuation, weak-evidence gating and vehicle duration. It writes no secrets and prints JSON containing samples, latency, call counts, cost estimates and deterministic QA results. A reviewer must still score Grounding, spoken rhythm, narrative focus and persona against the canonical human rubric; tests do not pretend to semantically fact-check model prose.
