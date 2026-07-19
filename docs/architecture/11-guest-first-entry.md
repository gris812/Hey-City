# Guest-First Entry Boundary

## Current identity model

The mobile app starts with one central identity authority in `AuthContext`.

- `loading`: temporary startup state while local identity is read.
- `guest`: no valid stored token; the app uses a stable local guest id.
- `authenticated`: a valid token is present and may be used for account endpoints.

Invalid or expired authentication clears the stored token and returns the app to `guest`.
Logout also returns the app to `guest`.

Guest identity is not an auth bypass. The guest id is local installation state only and is not sent as a backend access token.

## Guest defaults

Guest startup uses deterministic local defaults:

- guide: `dana`
- language: `auto`
- autoplay: `true`
- theme tags: `mixed`
- narration style: `documentary`

These defaults keep the first City Explorer screen usable without calling account-protected endpoints.

## Protected endpoints

The current backend protects these routes with `requireAuth`:

- `GET /me`
- `PUT /me`
- `PUT /me/privacy`
- `DELETE /me/history`
- `DELETE /me/history/items`
- `POST /drive/session/start`
- `POST /drive/session/stop`
- `POST /drive/session/ping`
- `POST /drive/session/story/finish`
- `POST /drive/poi/candidates`
- `POST /sessions/start`
- `POST /sessions/:sessionId/context`
- `POST /sessions/:sessionId/story/end`
- `POST /sessions/:sessionId/end`
- `POST /discovery/active-poi`
- `POST /stories/generate`
- `GET /pois/nearby`

## Follow-up requirement

Anonymous City Explorer backend sessions need an explicit backend contract before guest exploration can start real backend sessions.

That contract should define:

- which anonymous session endpoints are allowed;
- what data may be stored before account creation;
- how an anonymous session can later be associated with an authenticated account;
- rate limits and abuse protection for anonymous usage.

Until that exists, guest startup must stay in the local idle/exploring state and must not fabricate backend session data.
