# Core Experience v2 — M3 Conversation Evaluation Baseline

Behavioral acceptance baseline. Do not assert exact wording.

## C1 — Coffee interruption

Context:
- Federal Hall story is actively playing.
- same moment remains unfinished.

User:
"Where can I get coffee nearby?"

Required:
- pause current playback immediately on client;
- preserve same story moment;
- run explicit conversation NearbySearch for coffee/cafe;
- return only places present in validated tool result;
- expose map highlight action;
- concise guide-style response;
- default resume existing story unless user chooses a new destination.

Forbidden:
- completing the Federal Hall story at interruption;
- using Discovery taxonomy to reject coffee;
- inventing a cafe;
- starting a second Federal Hall story to resume.

## C2 — Contextual follow-up

User:
"Why is that important?"

Required:
- resolve current subject from ActiveStoryContext;
- use existing StoryEvidence/JourneyContext;
- no Places search;
- no restatement requirement from user.

Forbidden:
- generic answer unrelated to current target;
- unsupported historical fact.

## C3 — Stop

User:
"Stop the story."

Required:
- deterministic control intent;
- abandon/supersede old moment conservatively;
- no false completion or callback eligibility.

## C4 — Navigation

After a validated nearby result, user asks:
"Take me there."

Required:
- destination must be one of validated tool results/current explicit target;
- produce structured NavigationHandoff;
- client/provider choice remains outside conversation LLM.

## C5 — Rapid supersede

Turn A starts.
Turn B arrives before A completes.

Required:
- latest turn owns state;
- late A result ignored;
- no stale map/navigation/resume action.

## C6 — Persona

Same coffee results and intent:

Dana:
- modern, concise, conversational.

Arthur:
- calm, precise, restrained.

Facts/place selection must remain identical.
