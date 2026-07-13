# 1. Vision and Product Category

Hey City is a proactive conversational AI guide designed to help users
explore cities through voice interaction,

adaptive storytelling, and intelligent discovery of nearby places.

Unlike traditional travel apps that require users to search manually,
Hey City operates as an ambient AI companion

that understands the user's location and context and proactively
delivers stories about the city.

Product category:

Conversational City Exploration Platform

Core components:

• City Knowledge Graph

• AI Guide Brain

• Drive Discovery engine

• Map-first mobile interface

• Creator ecosystem for tours and stories

# 2. Core Product Principles

Map-First UX — the map is the primary interface and contextual layer.

Voice-First Interaction — users interact mainly through narration and
voice commands.

Ambient Intelligence — the system can proactively tell stories.

Safety First — optimized for driving mode with minimal visual
distraction.

Graph-Based Knowledge — cities are represented as knowledge graphs
connecting places, people, events, and stories.

# 3. Key Use Cases

• City exploration while walking

• Exploration while driving

• Tourist discovery of landmarks

• Local discovery of hidden places

• Thematic tours (architecture, history, food)

• Educational storytelling

• Family city exploration

# 4. User Journey

1\. User opens the app.

2\. Map shows nearby places.

3\. AI guide greets the user.

4\. Drive Discovery detects movement.

5\. When approaching a location, the guide starts telling a story.

6\. User can ask follow-up questions such as:

'Why is this building famous?'

'Tell me more about this area.'

# 5. Product Modes

Explore Mode — manual exploration through the map.

Driving Mode — stories triggered automatically while driving.

Tour Mode — curated routes created by guides or creators.

Creator Mode — tools for building tours and stories.

# 6. High Level System Architecture

Client Layer: Mobile App (React Native)

Backend Layer: Node.js / TypeScript / Express

Intelligence Layer:

• LLM

• Text‑to‑Speech

• City Knowledge Graph

Subsystems:

• Drive Discovery Engine

• AI Guide Brain

• Story Generation Pipeline

• Personalization System

# 7. AI Guide Brain

The AI Guide Brain orchestrates storytelling and conversation.

Modules:

Context Engine

Session Manager

Persona Manager

Story Selector

Narrative Planner

Conversation Manager

Safety Governor

Delivery Orchestrator

Memory Adapter

The system decides:

• what story to tell

• when to tell it

• how to tell it

# 8. City Knowledge Graph

The City Knowledge Graph connects entities:

Places

Stories

People

Events

Tours

Creators

Themes

Example:

Flatiron Building

→ architect: Daniel Burnham

→ year built: 1902

→ theme: early skyscrapers

# 9. Story Model

Story structure:

Hook – opening statement

Context – background

Facts – key historical details

Surprising detail – unexpected element

Closing – memorable ending

Themes:

history, architecture, culture, food, urban legends

# 10. Creator Ecosystem

Creators can publish tours and stories.

Tools:

Tour Builder

Story Editor

Audio Upload

Creator Profiles

Ratings and reviews

# 11. Personalization Engine

Signals used for personalization:

• Saved places

• Listening history

• Preferred themes

• Guide voice preference

This allows adaptive storytelling.

# 12. Data Sources

• OpenStreetMap

• Wikidata

• Wikipedia

• Public city datasets

• Creator‑generated content

# 13. Storage Architecture

Primary database: PostgreSQL

Cache: Redis

Media storage: Object storage for audio/images

# 14. Scalability

Designed to scale to millions of locations.

Strategies:

Stateless backend services

Horizontal scaling

Distributed caching

# 15. Safety and Driving Mode

Driving mode rules:

• Audio‑first interaction

• Minimal UI

• Large touch targets

• Short narration segments

# 16. Monetization Strategy

Freemium access

Premium thematic tours

Creator marketplace

City partnerships

Travel platform integrations

# 17. Go‑to‑Market Strategy

Launch in one major city first.

Partner with local creators and guides.

Promote via travel influencers and tourism channels.

Expand city‑by‑city.

# 18. Roadmap

Phase 1 — MVP

Map interface

Basic Drive Discovery

Short AI stories

Phase 2 — AI Guide Brain

Adaptive storytelling

Voice interaction

Phase 3 — Creator Economy

Tour builder

Creator marketplace

# 19. Future Extensions

• Augmented reality layers

• City digital twins

• AI travel companions

• Real‑time city intelligence
