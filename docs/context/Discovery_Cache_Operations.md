# Discovery request cost control

## September 12: production discovery-to-narration repair

The session story path previously consumed only the NYC seed pack, even though
Google discovery ran on each context evaluation. Live candidates now feed the
same deterministic decision and NarrativePlan boundary, with real coordinates.
Local seeds remain a fallback. A bounded shortlist (default 3) is enriched by
an exact-title Wikipedia lookup with redirect, disambiguation and coordinate
checks. Insufficient or unmatched evidence is skipped, never expanded from a
name alone. Source URL and CC BY-SA provenance accompany the seed. Knowledge
results are cached for 24 hours; failures back off for 5 minutes. No LLM performs
discovery, ranking or timing decisions.

Area lookup now uses the user's current position. A returned locality within
20 km can provide city context even behind the heading; this is an approximate
context radius, not proof of being inside a city boundary or a population filter.
Cities are considered first and narrated at most once per session. Unknown
heading is preserved as null: discovery starts around the fix, without a
fictional northward projection. Vehicle targets still use heading when available.

The 60-minute stationary refresh stays in place. Moving at least 3 km allows a
refresh after a minimum 180 seconds. Provider failures retry after the configured
error backoff. These thresholds increase useful discovery while bounding paid
calls; operation caches and request deduplication remain active. The combined
cache includes both projected cell and current area cell.

Known limits: exact Wikipedia titles can miss valid POIs; no population-based
major-city catalogue or verified administrative polygon containment yet.
Knowledge failures skip stories and need operational monitoring. Live VPS keys,
Wikipedia reachability and iPhone autoplay require production verification.
Web playback now acknowledges story completion to the session API, releasing
the already-listening gate. Text-only results do not lock that gate.

Area and Places operation caches are independent. Successful empty responses are
cached too; a failure in the other operation cannot discard a successful result.
Concurrent identical operation requests share one promise. Discovery selection,
ranking, session refresh intervals and NarrativePlan are unchanged.

Defaults (server environment):

- `AHEAD_DISCOVERY_AREA_CACHE_TTL_SECONDS=3600`
- `AHEAD_DISCOVERY_AREA_CACHE_PRECISION=6` (coarse geohash cell, not an administrative boundary)
- `AHEAD_DISCOVERY_ERROR_BACKOFF_SECONDS=300`
- Existing Places/provider cache TTL remains 900 seconds.

HTTP 401/403, geocoding REQUEST_DENIED and quota failures suspend the affected
operation across cells for the backoff period. Other failures back off per cache
key. Caches and circuit state are in memory and reset on server restart.
Near a cell or administrative boundary, cached area candidates may be approximate;
this data must not be used as an exact address.

New `product` usage events record `reverse_geocoding_attempt`,
`reverse_geocoding_error`, `places_nearby_new_attempt`, and
`places_nearby_new_error`. Successful Google responses retain their existing
Google operation names and gross estimates. These are not billing reconciliation;
historical events are not rewritten. Error events carry a safe error code only.

Web: start radar only after a location fix while the first context request is
pending; retain one user marker and call setPosition for subsequent fixes.
Map mounting and the location button request a one-shot GPS fix independently of
API session creation. Starting discovery first obtains a fix, then creates the
session and one watch. GPS failures release the watch so retry remains possible.
Late callbacks/responses from ended sessions are ignored.

The September 10 supplied Dana and Arthur v3 images replace both mobile source
images and WebApp portraits. Top-right avatars use transparent portraits over a
white circular CSS frame, cropped to head and shoulders. Profile images use the
supplied city photographs; originals are copied without generative alterations.
