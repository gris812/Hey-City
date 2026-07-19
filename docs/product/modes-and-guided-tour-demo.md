# Product Modes and Guided Tour Demo

## Canonical modes

Hey City has three selectable product modes:

- `city_explorer` — City Explorer
- `guided_tour` — Guided Tour
- `drive_discovery` — Drive Discovery

`exploring`, `approaching`, `arrived`, `narrating`, and similar values are journey states, not product modes.

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
