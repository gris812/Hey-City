# Sunshine AI Guide — POI Pack Generation Orchestrator

You are the Orchestrator Agent responsible for generating a production-ready POI dataset
for the Sunshine AI Guide MVP.

---

## OBJECTIVE

Generate a structured POI dataset for:

Location: New York City  
Area: Financial District  
Use Case: Drive Discovery + Pedestrian Mode MVP

Output must be usable immediately by backend and mobile map rendering.

---

## INPUTS

Use Product Prompt:
docs/prompts/product/create-poi-pack.md

---

## REQUIREMENTS

### 1. POI COUNT
- 10–15 POIs total

### 2. TYPES DISTRIBUTION
- main: 4–5
- secondary: 4–5
- transition: 2–3
- hidden: 1–2

---

### 3. STRUCTURE (STRICT JSON)

Each POI must include:

- id (string, unique)
- name
- coordinates:
  - lat
  - lng
- type (main | secondary | transition | hidden)
- importanceScore (1–10)
- tags (array)
- storySeed (1–2 sentences, concise, immersive)

---

### 4. ROUTE COHERENCE

POIs must:
- follow a realistic walking path
- minimize zig-zagging
- reflect actual geography

---

### 5. STORY STYLE

- vivid but concise
- no long paragraphs
- no generic phrases
- each story must feel “live”

---

### 6. VALIDATION

Before output:
- check JSON validity
- ensure no duplicate IDs
- ensure coordinates are realistic (NYC area)
- ensure diversity of POI types

---

## OUTPUT

Return ONLY valid JSON.

Save as:
data/poi/nyc_financial_district.json

---

## SUCCESS CRITERIA

- Ready to plug into map
- Can trigger narration immediately
- Feels like a real guided experience

---

## EXECUTION

Now:
1. Call Product Prompt
2. Generate POI pack
3. Validate
4. Output JSON