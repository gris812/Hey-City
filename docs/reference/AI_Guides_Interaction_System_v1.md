# AI Guides — Interaction System v1.0

## 1. Purpose

Defines how multiple AI guides (Dana, Arthur) coordinate, switch, and
co-exist during a session.

Goals: - Keep experience natural and conversational - Avoid overlap and
cognitive overload - Enable seamless switching and collaboration -
Support product modes (walking / vehicle / Q&A)

------------------------------------------------------------------------

## 2. Core Principles

### 2.1 One Voice at a Time

Only one guide speaks at any moment.

### 2.2 Continuity Over Fragmentation

Switching guides must preserve context (POI, theme, narrative state).

### 2.3 Personality Consistency

Each guide must remain within their persona constraints.

### 2.4 Safety First

In Vehicle Mode: - short messages - no rapid switching - minimal
interruptions

------------------------------------------------------------------------

## 3. Roles in Interaction

| Role              | Dana                 | Arthur             |
|-------------------|----------------------|--------------------|
| Primary strength  | Aesthetic, lifestyle | History, context   |
| Best use          | discovery, vibe      | explanation, depth |
| Interaction style | inviting             | conversational     |

------------------------------------------------------------------------

## 4. Guide Selection Logic

### 4.1 Default Selection

Based on: - user preference - theme (e.g., history → Arthur) - content
type (hidden gems → Dana)

### 4.2 Dynamic Override

System may suggest another guide if: - current guide is suboptimal -
user asks deeper question

------------------------------------------------------------------------

## 5. Switching Logic

### 5.1 Manual Switch

Triggered by user: - UI selection - voice command

Behavior: - immediate switch - context preserved

------------------------------------------------------------------------

### 5.2 Soft Handoff (Recommended)

Current guide introduces the other.

#### Dana → Arthur

“Arthur would probably explain this better than I can…”

#### Arthur → Dana

“You might enjoy Dana’s perspective here…”

Rules: - max 1 sentence - no repetition - no overlap

------------------------------------------------------------------------

### 5.3 Auto Switch (System-driven)

Allowed only if: - strong relevance shift - user intent detected

Example: - user asks “why was it built?” → switch to Arthur

------------------------------------------------------------------------

## 6. Conversation Modes

### 6.1 Explore Mode (Default)

- primary guide speaks
- secondary guide optional

### 6.2 Dialogue Mode (Advanced)

- both guides participate
- controlled alternation

Pattern: Dana → Arthur → Dana (max 2 turns each)

------------------------------------------------------------------------

### 6.3 Vehicle Mode

- single guide only
- no switching during narration
- handoff only between segments

------------------------------------------------------------------------

## 7. Turn-Taking Rules

- no interruptions mid-sentence
- next speaker only after completion
- minimum gap: 0.5–1 sec

------------------------------------------------------------------------

## 8. Content Coordination

### 8.1 Avoid Redundancy

- no repeated facts
- complementary information only

### 8.2 Layered Storytelling

Dana: - visual + emotional layer

Arthur: - historical + contextual layer

------------------------------------------------------------------------

## 9. Use Case — Flatiron Building

### Dana (start)

“Look at how this building cuts through the avenue. I’ve marked this
spot — it’s perfect in this light.”

### Transition

“If you’re curious how it all started, Arthur might enjoy this one.”

### Arthur

“When this was built in 1902, people weren’t sure it would stand…”

------------------------------------------------------------------------

## 10. Error Handling

### 10.1 Conflict Prevention

If both guides are eligible: - select one based on priority

### 10.2 Fallback

If guide fails: - system continues with current guide

------------------------------------------------------------------------

## 11. System Constraints

- max 2 guide switches per POI
- max 2 speakers per narrative
- cooldown between switches: 10–20 sec

------------------------------------------------------------------------

## 12. Integration with AI Guide Brain

Interaction System sits between:

Narrative Planner → Persona Layer → Delivery

Responsibilities: - select active persona - manage switching - enforce
rules

------------------------------------------------------------------------

## 13. Future Extensions

- multi-guide debates
- premium personalities
- adaptive personality blending

------------------------------------------------------------------------

## 14. File Placement

Folder: 03 Product / AI Guides File Name: AI Guides Interaction System
v1.0
