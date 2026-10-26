# Product Modes and Guided Tour Demo

## Canonical modes

Hey City has three selectable product modes:

- `city_explorer` — City Explorer
- `guided_tour` — Guided Tour
- `drive_discovery` — Drive Discovery

`exploring`, `approaching`, `arrived`, `narrating`, and similar values are journey states, not product modes.

## Native field behaviors (stacked Draft PR #25 → #26)

These refinements do not add product modes. **City Explorer / Guided Tour** remain product
scenarios; **walking / vehicle** is an authoritative server movement state; and
**walking / urban / highway** are discovery search profiles. The native City Explorer
starts a server session with `mode: walking, autoMode: true` and displays confirmed
`PingResult.mode`. GPS speed is converted from meters/second to km/h for transport;
unavailable speed does not count as a stop. The existing server hysteresis applies.

When the user opens a known object associated with the active session, **Tell me about
this place / Рассказать сейчас** requests a short verified narrative using
`POST /sessions/:sessionId/select`. A detailed request uses the same endpoint at
`level: long` and can legitimately fail with 422 for missing evidence. An explicit
request bypasses automatic timing; it does **not** bypass evidence, safety, costs or
session ownership. Discovery target, opened POI and audible narrative target are
distinct. Route handoff to Maps remains an independent user action.

The native map compass toggles **north-up** / **course-up** using existing GPS course
(no routing API); course-up falls back to north without a trustworthy moving heading.
Pan gestures release camera following; explicit recenter restores it. Orientation
never changes Discovery geometry or provider costs.

Unit preference (metric / imperial) is persisted in the same guest/auth preferences,
independently from UI/guide language. SI remains canonical for backend calculations,
scoring and thresholds. **Foreground** City Explorer/Guided Tour uses Expo keep-awake
while the session is active and releases on stop, unmount or background. Keep-awake
prevents automatic dim/sleep; it does not grant background location/audio execution.

## Navigation

The bottom navigation is:

- Explore
- History
- Settings

The standalone Map tab is removed. Map behavior now belongs inside Explore.

## Current mode scope

City Explorer is the default mode. It shows map/location context but does not fabricate discovery targets or stories while anonymous backend discovery is still future work.

Guided Tour is the deterministic demo mode. It validates movement, route display, target transitions, selected guide behavior, selected guide language, text narration, pause/continue, and completion.

Drive Discovery keeps the existing authenticated backend contract and is not expanded in this slice.

## Demo tours

Tour A, Historic Financial District, is metadata only for future use. Its target order is:

1. Federal Hall
2. New York Stock Exchange
3. Wall Street
4. Charging Bull
5. Bowling Green
6. Fraunces Tavern
7. Stone Street

Tour B, World Trade Center & Waterfront, is the implemented deterministic demo. Its target order is:

1. Trinity Church
2. One World Trade Center
3. 9/11 Memorial
4. Battery Park City / Marina

## Account prompt after value

After Guided Tour completion, account creation remains optional. The product offers Finish, Continue exploring, and Sign In / Sign Up.
