# Discovery request cost control

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
Location button recenters an existing watch instead of creating another watch.
Compact guide images use the existing mobile Dana.png and Artur.png assets;
profile photography is unchanged. Dana v3.0 is absent from this checkout.
