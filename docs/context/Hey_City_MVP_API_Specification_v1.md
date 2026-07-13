#**Hey City MVP API Specification v1.0**

Hey City / Sunshine AI Guide

Version: 1.0\
Date: 03-15-2026

Purpose: Define the minimum backend API required to support the Hey City
MVP.

The API is designed to support the core MVP experience:

- map-based city exploration

- nearby POI discovery

- adaptive storytelling

- AI-generated tours

- saved places

- walking and driving modes

This specification prioritizes simplicity and fast implementation.

##**1. API Principles**

The MVP API follows these principles:

1.  Simple and predictable REST structure

2.  Mobile-first responses

3.  Minimal payload size

4.  Clear separation between discovery, storytelling, tours, and user
    actions

5.  Support for future extension without breaking current endpoints

Base URL example:

/api/v1

Authentication for MVP:

Bearer token

Content type:

application/json

##**2. Main API Domains**

The MVP API is divided into the following domains:

- Auth

- User

- POI Discovery

- Storytelling

- Tours

- Saved Places

- System / Health

##**3. Authentication API**

For MVP, authentication can be simple.

Supported methods:

- email-based auth

- magic link

- anonymous guest mode (optional for early prototype)

###**3.1 Sign In**

**Endpoint**

POST /api/v1/auth/sign-in

**Request**

{

"email": "user@example.com"

}

**Response**

{

"status": "ok",

"message": "Magic link sent"

}

###**3.2 Verify Token**

**Endpoint**

POST /api/v1/auth/verify

**Request**

{

"token": "verification_token"

}

**Response**

{

"access_token": "jwt_token",

"user": {

"user_id": "uuid",

"email": "user@example.com",

"name": "User"

}

}

##**4. User API**

###**4.1 Get Current User**

**Endpoint**

GET /api/v1/me

**Response**

{

"user_id": "uuid",

"email": "user@example.com",

"name": "User",

"preferred_guide": "sophia",

"preferred_mode": "walking",

"preferred_theme": "history"

}

###**4.2 Update User Preferences**

**Endpoint**

PATCH /api/v1/me

**Request**

{

"preferred_guide": "elena",

"preferred_mode": "driving",

"preferred_theme": "architecture"

}

**Response**

{

"status": "ok"

}

##**5. POI Discovery API**

This domain powers the map and location-based exploration.

###**5.1 Get Nearby POIs**

**Endpoint**

GET /api/v1/pois/nearby

**Query Parameters**

lat

lng

radius

mode

theme

limit

**Example**

GET
/api/v1/pois/nearby?lat=40.7411&lng=-73.9897&radius=500&mode=walking&theme=architecture&limit=20

**Response**

{

"pois": \[

{

"poi_id": "uuid",

"name": "Flatiron Building",

"latitude": 40.7411,

"longitude": -73.9897,

"category": "architecture",

"short_description": "Iconic triangular skyscraper completed in 1902.",

"image_url": "https://cdn.example.com/flatiron.jpg",

"importance_score": 95

}

\]

}

###**5.2 Get POI Details**

**Endpoint**

GET /api/v1/pois/{poi_id}

**Response**

{

"poi_id": "uuid",

"name": "Flatiron Building",

"city_id": "uuid",

"latitude": 40.7411,

"longitude": -73.9897,

"category": "architecture",

"short_description": "Iconic triangular skyscraper completed in 1902.",

"image_url": "https://cdn.example.com/flatiron.jpg",

"importance_score": 95,

"themes": \["architecture", "history"\],

"available_modes": \["walking", "driving"\]

}

###**5.3 Get Active POI Candidate**

This endpoint supports Drive Discovery / Walking Discovery logic.

**Endpoint**

POST /api/v1/discovery/active-poi

**Request**

{

"lat": 40.7411,

"lng": -73.9897,

"speed_mps": 1.4,

"heading": 180,

"mode": "walking",

"theme": "architecture"

}

**Response**

{

"poi": {

"poi_id": "uuid",

"name": "Flatiron Building",

"latitude": 40.7411,

"longitude": -73.9897,

"image_url": "https://cdn.example.com/flatiron.jpg"

},

"distance_meters": 62,

"eta_seconds": 48,

"trigger_story": true

}

##**6. Storytelling API**

This domain powers AI narration.

###**6.1 Get Story for POI**

**Endpoint**

POST /api/v1/stories/generate

**Request**

{

"poi_id": "uuid",

"mode": "walking",

"theme": "architecture",

"guide": "sophia",

"target_duration_sec": 20,

"context": {

"nearby_poi_ids": \["uuid1", "uuid2"\],

"previous_story_node_ids": \["node1", "node2"\]

}

}

**Response**

{

"story_id": "uuid",

"title": "Flatiron Building Intro",

"text": "This triangular building became one of New York's most iconic
early skyscrapers.",

"target_duration_sec": 20,

"audio_url": "https://cdn.example.com/audio/story123.mp3",

"poi_id": "uuid",

"story_nodes": \[

{

"node_id": "node1",

"node_type": "intro"

},

{

"node_id": "node2",

"node_type": "fact"

}

\]

}

###**6.2 Continue Narrative**

This endpoint supports continuous storytelling.

**Endpoint**

POST /api/v1/stories/continue

**Request**

{

"current_poi_id": "uuid",

"current_story_node_id": "node2",

"next_poi_id": "uuid_next",

"mode": "walking",

"theme": "architecture",

"guide": "sophia",

"available_duration_sec": 12

}

**Response**

{

"story_id": "uuid",

"text": "The Flatiron Building belonged to a generation of bold
structures that changed the Manhattan skyline.",

"audio_url": "https://cdn.example.com/audio/story124.mp3",

"story_nodes": \[

{

"node_id": "bridge_1",

"node_type": "bridge"

}

\]

}

###**6.3 Ask Guide a Question**

**Endpoint**

POST /api/v1/guide/ask

**Request**

{

"poi_id": "uuid",

"guide": "sophia",

"question": "Why is this building triangular?",

"mode": "walking"

}

**Response**

{

"answer_text": "Its unusual shape comes from the intersection of
Broadway and Fifth Avenue.",

"audio_url": "https://cdn.example.com/audio/answer001.mp3"

}

##**7. Tour API**

This domain supports AI-generated tours and basic creator tours.

###**7.1 Generate AI Tour**

**Endpoint**

POST /api/v1/tours/generate

**Request**

{

"city_id": "uuid",

"start_lat": 40.7411,

"start_lng": -73.9897,

"theme": "architecture",

"mode": "walking",

"duration_minutes": 45,

"guide": "daniel"

}

**Response**

{

"tour_id": "uuid",

"title": "Architecture Walk in Manhattan",

"description": "A curated AI-generated walk exploring iconic New York
architecture.",

"tour_type": "ai_generated",

"stops": \[

{

"poi_id": "uuid1",

"name": "Flatiron Building",

"stop_order": 1,

"latitude": 40.7411,

"longitude": -73.9897,

"image_url": "https://cdn.example.com/flatiron.jpg"

},

{

"poi_id": "uuid2",

"name": "Met Life Tower",

"stop_order": 2,

"latitude": 40.7420,

"longitude": -73.9870,

"image_url": "https://cdn.example.com/metlife.jpg"

}

\]

}

###**7.2 Get Tour Details**

**Endpoint**

GET /api/v1/tours/{tour_id}

**Response**

{

"tour_id": "uuid",

"title": "Architecture Walk in Manhattan",

"description": "A curated AI-generated walk exploring iconic New York
architecture.",

"tour_type": "ai_generated",

"created_by": "system",

"stops": \[

{

"poi_id": "uuid1",

"name": "Flatiron Building",

"stop_order": 1

},

{

"poi_id": "uuid2",

"name": "Met Life Tower",

"stop_order": 2

}

\]

}

###**7.3 List Available Tours**

**Endpoint**

GET /api/v1/tours

**Query Parameters**

city_id

theme

tour_type

limit

offset

**Response**

{

"tours": \[

{

"tour_id": "uuid",

"title": "Art Deco Manhattan",

"description": "Creator-curated tour of Manhattan's Art Deco
landmarks.",

"tour_type": "creator"

}

\],

"total": 12

}

##**8. Saved Places API**

###**8.1 Save Place**

**Endpoint**

POST /api/v1/saved-places

**Request**

{

"poi_id": "uuid"

}

**Response**

{

"status": "ok",

"saved_id": "uuid"

}

###**8.2 List Saved Places**

**Endpoint**

GET /api/v1/saved-places

**Response**

{

"saved_places": \[

{

"saved_id": "uuid",

"poi_id": "uuid",

"name": "Flatiron Building",

"image_url": "https://cdn.example.com/flatiron.jpg",

"saved_at": "2026-03-15T12:00:00Z"

}

\]

}

###**8.3 Remove Saved Place**

**Endpoint**

DELETE /api/v1/saved-places/{saved_id}

**Response**

{

"status": "ok"

}

##**9. Discovery Session API**

This domain supports continuous exploration sessions.

###**9.1 Start Session**

**Endpoint**

POST /api/v1/sessions/start

**Request**

{

"mode": "walking",

"guide": "sophia",

"theme": "history",

"city_id": "uuid"

}

**Response**

{

"session_id": "uuid",

"status": "active"

}

###**9.2 Update Session Context**

**Endpoint**

POST /api/v1/sessions/{session_id}/context

**Request**

{

"lat": 40.7411,

"lng": -73.9897,

"speed_mps": 1.3,

"heading": 170,

"active_poi_id": "uuid"

}

**Response**

{

"status": "ok",

"next_action": "play_story"

}

###**9.3 End Session**

**Endpoint**

POST /api/v1/sessions/{session_id}/end

**Response**

{

"status": "ended"

}

##**10. Health and System API**

###**10.1 Health Check**

**Endpoint**

GET /api/v1/health

**Response**

{

"status": "ok"

}

##**11. Suggested Response Conventions**

Every API response should follow consistent patterns.

Success example:

{

"status": "ok",

"data": {}

}

Error example:

{

"status": "error",

"error_code": "POI_NOT_FOUND",

"message": "POI not found"

}

##**12. Suggested HTTP Status Codes**

200 OK

201 Created

400 Bad Request

401 Unauthorized

404 Not Found

500 Internal Server Error

##**13. MVP Implementation Notes**

For MVP, the following simplifications are recommended:

- no public creator upload API yet

- no social feed API yet

- no advanced analytics API yet

- no moderation API yet

These can be added after launch.

##**14. Minimal MVP Endpoint Set**

If the team wants the smallest possible implementation, the minimum
working set is:

POST /auth/sign-in

POST /auth/verify

GET /me

PATCH /me

GET /pois/nearby

GET /pois/{poi_id}

POST /discovery/active-poi

POST /stories/generate

POST /guide/ask

POST /tours/generate

GET /tours/{tour_id}

POST /saved-places

GET /saved-places

DELETE /saved-places/{saved_id}

POST /sessions/start

POST /sessions/{session_id}/context

POST /sessions/{session_id}/end

GET /health

##**15. Final MVP API Definition**

The Hey City MVP API is designed to support one core product promise:

**A user opens the app, moves through the city, and the city begins to
tell its story.**

This API is sufficient to support:

- nearby discovery

- adaptive narration

- AI guide interaction

- AI tours

- saved places

- session-based movement tracking

It is intentionally minimal and extensible.
