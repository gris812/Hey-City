Implement AI/narration support for the approved slice.

Rules:
- LLM only generates from structured NarrativePlan input
- guide style must come from DANA.json and ARTUR.json
- output must respect mode, theme, language, and target duration
- keep prompts compact and deterministic
- summarize changed files and open issues at the end