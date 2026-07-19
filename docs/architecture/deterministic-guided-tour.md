# Deterministic Guided Tour Demo

## Boundary

Guided Tour is a deterministic local demo. It does not use Google Directions, Google Places, geocoding, Mapbox, backend narrative planning, LLM generation, TTS, or anonymous backend sessions.

The demo uses:

- curated target coordinates;
- fixed route coordinates;
- deterministic normalized location events;
- fixed target order;
- fixed approved text narratives;
- local text overlay before TTS.

## Dataset schema

Tour B is defined in mobile source as structured data with:

- target ID and order;
- coordinates;
- target type and category tags;
- trigger radii;
- Dana and Arthur narratives in English and Russian;
- facts with source references and verification dates;
- media metadata;
- route segment coordinates;
- presentation metadata.

Narratives are selected by preferred guide and guide language. Application language does not choose story language.

## State machine

Guided Tour owns target order and journey state centrally.

Journey states include:

- idle
- exploring
- approaching
- arrived
- narrating
- paused
- waiting_to_continue
- moving_to_next_target
- completed
- holding
- error

Location events are analyzed against the current target radii. Arrival triggers narrative once and target advancement waits for Continue or auto-continue.

## Narrative overlay

Until TTS is implemented, stories are text. The overlay shows:

- object title;
- selected guide;
- selected guide-language narrative;
- scrollable text;
- Pause;
- Resume;
- Continue;
- auto-continue countdown.

No fake waveform or audio state is shown.

## Pause semantics

Pause freezes simulated movement, narrative timing, auto-continue countdown, and target transitions. Resume continues from the same logical state.

## Map inside Explore

Explore owns the map. Guided Tour draws the fixed route, target markers, current target emphasis, and simulated user marker. It does not jump to physical device location during Tour B.

## Developer tools

Deterministic location simulation is a developer tool under Settings in development builds. It shows Tour B state, current target, distance, completed targets, and normalized location output. It does not generate stories independently of the tour controller.

## Remaining backend gap

Anonymous City Explorer discovery and production story generation remain future backend work. The current demo must not be mistaken for the final Ambient Discovery Engine.
