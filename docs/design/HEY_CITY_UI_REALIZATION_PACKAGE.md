# Hey City UI Realization Package

Status: Approved for implementation

## Purpose

Define the canonical mobile UX direction for Hey City and the boundaries for reusing the Lovable prototype.

The Lovable repository is a visual reference only. Production UI is implemented in the existing React Native app and remains driven by backend session state.

## Product principles

1. Guest-first activation. Account creation happens only after the user has experienced product value.
2. City Explorer is the primary MVP mode.
3. Voice leads; the map provides spatial context.
4. The city and active DiscoveryTarget remain visually dominant. Guide presence is supportive, not central.
5. Backend services decide target, timing, story, duration, safety, and active guide. Mobile renders those decisions.
6. Vehicle Mode is audio-first and visually reduced.
7. `Exploring`, `Approach`, and `Immersion` are presentation states, not product decision logic.

## Canonical naming

- `Dana` is the canonical display name; `dana` is the canonical code identifier.
- `Arthur` is the canonical display name; `arthur` is the canonical code identifier.
- `Artur` and `artur` are deprecated spellings and must not be introduced in new code or documentation.
- Existing occurrences should be migrated only when the affected code is already in scope, unless a broader migration is explicitly scheduled.

## Approved visual direction from Lovable

Reuse conceptually:

- warm cream background and near-black text;
- Dana warm-gold accent and Arthur muted-blue accent;
- Inter/system typography hierarchy;
- large 20–24px radii;
- restrained shadows and translucent floating surfaces;
- guide-selection card composition;
- bottom Story Panel composition;
- compact status pill;
- low-contrast sepia map direction;
- optional curated POI media for demo targets.

Do not copy Lovable web components or Tailwind implementation into React Native.

## Canonical design tokens

```ts
export const colors = {
  background: '#F8F5EE',
  foreground: '#1C1C1E',
  surface: '#FFFDF8',
  surfaceMuted: '#F1ECE3',
  border: '#DED7CB',
  textMuted: '#77736D',
  dana: '#D6C3A3',
  arthur: '#6B8CA3',
  warning: '#B87926',
  danger: '#B5413C',
};

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
```

All production components must consume shared tokens. No screen-level duplicate palettes.

## Canonical mobile state model

```ts
type DiscoveryPhase = 'idle' | 'exploring' | 'approaching' | 'target_active' | 'holding';
type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'completed' | 'error';
type PresentationMode = 'map' | 'approach' | 'media';

type LivePresentationState = {
  discoveryPhase: DiscoveryPhase;
  playbackState: PlaybackState;
  activeTarget?: DiscoveryTargetSummary;
  activeGuideId: 'dana' | 'arthur';
  presentationMode: PresentationMode;
  transcriptPreview?: string;
  audioProgress?: number;
  holdReason?: string;
};
```

The presentation mapper derives this model from backend session responses. UI must not advance phases using timers.

## Guide model

For MVP:

```ts
type GuidePreference = 'dana' | 'arthur';
type GuideOrchestrationPolicy = 'single' | 'contextual_handoff';
```

Do not expose a permanent `both` mode. One guide speaks at a time. Optional handoff is controlled by the AI Guide Brain and only between narrative segments.

## First implementation slice

The first implementation slice is deliberately narrow. It is **not** a full visual redesign of `LiveScreen`.

It contains only:

1. shared design tokens and minimal reusable UI primitives required by this slice;
2. typed live presentation state and a mapper from existing backend responses;
3. a reusable Story Panel;
4. a compact status pill;
5. functional playback/session controls connected to existing handlers;
6. unit tests for the presentation mapper.

It must preserve the current screen structure, map implementation, session lifecycle, diagnostics, and backend contracts except for the minimum integration needed to render these new components.

Explicitly out of scope for the first slice:

- full-screen visual redesign;
- onboarding changes;
- auth/guest-session changes;
- map restyling;
- camera transitions;
- Approach or Immersion implementation;
- guide portrait redesign;
- navigation redesign;
- backend API changes;
- new audio provider integration.

## Lovable references for the first slice

Repository: `gris812/city-whisperer-onboarding`

Use these files as visual and structural references only:

### Design tokens

- `src/index.css`
  - use CSS variables at lines defining background, foreground, primary, secondary, muted, border, and radius as the source for color/radius intent;
  - translate them into typed React Native tokens;
  - do not copy Tailwind or CSS animation code.

### Story Panel and controls

- `src/components/home/StoryPanel.tsx`
  - reuse the composition: floating bottom surface, transcript area, separator, compact action row;
  - reuse the restrained spacing, radius, shadow, and text hierarchy;
  - do not copy the decorative `Ask`/`Pause` buttons as-is;
  - all production controls must receive real handlers, disabled/loading states, accessibility labels, and playback-state-dependent labels.

### Status pill

- `src/components/home/TopBar.tsx`
  - reuse only the center status-pill composition: translucent rounded surface, status dot, short status label;
  - do not copy routing, menu, settings, `/github-connect`, or the Lovable `MapState` logic;
  - status text must be derived from typed production state.

### Arthur accent and visual intent

- `src/components/onboarding/GuideSelectionScreen.tsx`
  - use the Arthur secondary accent treatment and Dana primary accent treatment only as visual reference;
  - do not copy guide-selection logic, `both` mode, animations, language selector, or onboarding flow into this slice.

Direct repository links:

- https://github.com/gris812/city-whisperer-onboarding/blob/main/src/index.css
- https://github.com/gris812/city-whisperer-onboarding/blob/main/src/components/home/StoryPanel.tsx
- https://github.com/gris812/city-whisperer-onboarding/blob/main/src/components/home/TopBar.tsx
- https://github.com/gris812/city-whisperer-onboarding/blob/main/src/components/onboarding/GuideSelectionScreen.tsx

## Guest-first onboarding

The onboarding must eventually be one compact flow:

1. Continue as Guest is the primary entry.
2. Device language is preselected.
3. Dana or Arthur preference is selectable but has a default.
4. Location permission is requested with a clear value explanation.
5. User enters City Explorer immediately.
6. The first story is an area introduction based on current context.

Account creation is shown only after:

- the first session ends;
- the user saves a place;
- the user wants history, sharing, sync, or premium features.

This onboarding work is not part of the first implementation slice.

## Live Screen composition target

The eventual layer order is:

1. map or optional curated media;
2. target emphasis;
3. compact top status area;
4. small guide presence integrated into status or Story Panel;
5. bottom Story Panel;
6. large movement-safe controls when required.

Required controls:

- Ask;
- Pause/Resume;
- Skip;
- Finish/End session;
- Mute where applicable.

Controls must represent real handlers and real playback state. Decorative inactive controls are prohibited in demo builds.

## Map presentation rules

### Exploring

- default City Explorer state;
- no fixed route line unless Route Mode is explicitly active;
- sparse target markers;
- street names remain readable;
- selected target comes from backend `DiscoveryDecision`;
- zones and non-POI DiscoveryTargets must be supported.

### Approach

Optional. Use only when:

- target geometry is reliable;
- user speed and mode allow visual attention;
- camera can show the target without severe occlusion;
- provider supports the required presentation.

Camera presets must be target-aware. Do not use one fixed zoom/pitch/bearing for all targets.

### Immersion / media

Optional capability, not a mandatory phase. Supported modes:

```ts
type TargetMediaMode = 'none' | 'photo' | 'panorama' | 'street_imagery' | 'curated_cinematic';
```

Use only for curated demo targets with verified assets. Never imply that static media is a live camera view.

## Mobile/backend boundary

Mobile may:

- collect location, speed, heading, app state, and user actions;
- start, ping, and stop sessions;
- render backend decisions;
- manage local playback pause/resume;
- display safe degraded states.

Mobile must not:

- choose the next DiscoveryTarget;
- decide trigger timing;
- generate stories;
- select providers;
- switch guides arbitrarily;
- change session language automatically;
- advance presentation state using fixed timers.

## Lovable code disposition

| Area | Decision |
|---|---|
| Palette and typography | Recreate as shared React Native tokens |
| Guide cards | Rebuild later in React Native using approved composition |
| Story Panel | Rebuild in first slice and connect to real actions |
| Status pill | Rebuild in first slice and drive from typed state |
| Controls | Rebuild in first slice with real handlers |
| Sepia map style | Visual reference only; not part of first slice |
| Exploring/Approach/Immersion | Presentation vocabulary only; not part of first slice |
| Numeric onboarding controller | Reject |
| Auth before first value | Reject |
| `both` guide mode | Reject for MVP |
| Timer-driven target transitions | Reject |
| Hardcoded route/POI sequencing | Keep only in deterministic dev/demo fixtures |
| Full-screen curated POI media | Optional later capability |

## Definition of done for the first slice

The first slice is complete only when:

- shared tokens are introduced and consumed by the new components;
- typed presentation state exists;
- the mapper derives state from current API responses without timers;
- Story Panel, status pill, and controls are implemented as reusable components;
- Pause/Resume uses local playback state;
- Skip/Finish use existing backend endpoints;
- no decorative control is presented as functional;
- current map and diagnostics remain available;
- no full visual redesign is included;
- `npm run typecheck` passes in `mobile/`;
- relevant mapper tests pass;
- documentation remains synchronized;
- no product decision is moved from backend to mobile.
