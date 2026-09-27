# Core Experience v2 — M4 Realtime Voice Benchmark Baseline

**Purpose:** compare realtime providers using identical Hey City interaction scripts.  
**Do not select a provider from reputation alone.**

## Candidates

Initial benchmark candidates:
- OpenAI Realtime
- Gemini Live

Provider route remains configurable. Additional providers may be added through the same contract.

## Test environment record

Every run must record:
- date/time;
- app/client platform;
- client transport;
- network type;
- provider;
- model;
- region if known;
- guide;
- language;
- session configuration;
- inactivity timeout;
- whether result is mocked, lab-live or field-live.

Do not compare unlike network environments without labeling the difference.

## B1 — Coffee interruption

Start:
- Federal Hall story playing.
- original moment/audio known.

User:
"Where can I get coffee nearby?"

Required:
- local story pause;
- voice turn finalization;
- existing M3 NearbySearch;
- validated map action;
- grounded spoken answer;
- same-moment resume.

Record:
- local pause ms;
- session connect/ready ms;
- end-speech -> final turn ms;
- end-speech -> first response audio ms;
- total turn ms;
- tools correct yes/no;
- resume correct yes/no;
- estimated cost.

## B2 — Contextual follow-up

User:
"Why is that important?"

Required:
- active subject resolved;
- StoryEvidence grounding;
- no Places call;
- approved answer facts preserved.

Record:
- recognition result correctness;
- first-audio latency;
- factual drift yes/no;
- persona rating.

## B3 — Barge-in

Provider begins speaking an answer.

User interrupts:
"No, I meant parking."

Required:
- old output stops;
- stale chunks do not continue;
- new turn wins;
- parking search, not prior coffee result.

Record:
- speech onset -> output stopped ms;
- stale audio observed yes/no;
- new turn correctness;
- map/tool correctness.

## B4 — Road noise

Use the same controlled noise fixture for all providers.

Required:
- intended utterance recognized;
- no excessive false turns.

Record:
- transcript/intent correctness;
- false-start count;
- missed-turn count;
- latency change versus quiet run.

## B5 — Dana / Artur

Use the same approved factual answer content.

Record:
- factual preservation;
- Dana vs Artur distinguishability;
- naturalness;
- pacing;
- pronunciation for Russian and English.

Use a small fixed 1–5 human rubric for the subjective fields and keep raw latency metrics separate.

## B6 — Session lifecycle

Sequence:
1. open realtime;
2. two normal turns;
3. wait beyond inactivity timeout;
4. verify close;
5. reopen;
6. run one more turn.

Required:
- no provider calls after close;
- clean reopen;
- no stale M3/voice state.

Record:
- session duration;
- reconnect latency;
- errors;
- input/output usage;
- cost.

## Summary table

For each provider/model/transport report:

| Metric | Provider A | Provider B |
|---|---:|---:|
| connect p50 / p95 | | |
| speech-end -> final turn p50 / p95 | | |
| speech-end -> first audio p50 / p95 | | |
| barge-in stop p50 / p95 | | |
| tool reliability | | |
| factual preservation | | |
| noise handling | | |
| persona score Dana | | |
| persona score Artur | | |
| reconnect success | | |
| estimated active-minute cost | | |
| representative 30-min session cost | | |
| client integration complexity | | |

## Decision

The report may recommend a default route, but must also list:
- provider limitations;
- fallback behavior;
- conditions that would trigger reevaluation.

Do not rewrite canonical architecture based on one provider.
