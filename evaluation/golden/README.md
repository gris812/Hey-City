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

### Dynamic narrative benchmark

Use a public test coordinate. The default sample has ten nearby geotagged Wikimedia objects and ten objects from a versioned regional/type/coverage sampling frame. This frame has coverage bias and is not a population estimate. The saved manifest records the seed, entity IDs and source revision. Replay the manifest for exact membership because upstream nearby results may change.

```sh
npm run benchmark:narrative --workspace server -- --lat 25.8195 --lng -80.3553 --seed 20261109 --out /tmp/hey-city-narrative.json
npm run benchmark:narrative --workspace server -- --replay /tmp/hey-city-narrative.json --knowledge-only --out /tmp/hey-city-knowledge.json
```

For paid comparison, pass `--live --budget-usd AMOUNT` with `OPENAI_API_KEY`, `GEMINI_API_KEY`, `BENCHMARK_GEMINI_MODEL` and `BENCHMARK_GEMINI_INPUT_USD_PER_MILLION` / `BENCHMARK_GEMINI_OUTPUT_USD_PER_MILLION` supplied securely to the runner. Gemini controlled receives the same selected evidence and storytelling brief. Ordinary receives the identity and a natural request and may rely on its own knowledge. Generation runs serially with a deadline and estimated cost reservation. Ambiguous paid failures require explicit replay. CI uses deterministic fixtures without paid calls. For TTS use the existing `evaluate:m1` live probe. Delivery of audio bytes and actual native playback have separate measurements.

Give one independent reviewer the `.blind.json` packet and source references separately, keeping system mapping hidden. Rate engagement (30), spoken quality (25), relevance (20), discovery (15) and coherence (10). Record factuality and safety separately as pass, fail or uncertain, plus a brief rationale. Review JSON uses `{evaluator, rubricVersion, blind:true, pairs:[{id,A:{scores,factuality,safety,rationale},B:{...}}]}`. Run `npm run benchmark:narrative:review --workspace server -- RUN.json REVIEW.json [ACCEPTED_BASELINE.json]`. An accepted baseline has the same rubric and explicit `accepted:true`. The comparison reports deltas for matched cases. Check reviewer style and language bias during human signoff.

Field measurements use the existing product usage boundary. Compare backend SHA and native SHA, request, retrieval, generation and TTS stages, native playing/failure, completion/skip and continuation events. Use existing provider usage for cost estimates. Field reports exclude precise user coordinates and transcripts. Field sessions use the configured production providers.
