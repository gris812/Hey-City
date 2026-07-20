# REVIEW 004 — Guide and Target Experience

**Reviewed implementation SHA:** `2f4243682a0393ff78ac381677f2231e71a1b2c1`  
**Review status:** **ACCEPT WITH REQUIRED FOLLOW-UP**

## Confirmed

- `GuideQuickPreviewSheet` exists for Dana and Arthur.
- `LiveOverlay` includes `guide_quick_preview` and remains mutually exclusive with Tour Preferences and Transcript.
- `LiveForegroundPhase` includes `guided_at_target`.
- Guided Tour state now supports `arrived -> at_target -> narrating`.
- `ApproachingTargetView` and `AtTargetView` are separate components.
- At Target supports local image media and no-image/error fallback.
- EN/RU strings were added for the new surfaces.
- Deterministic controller tests were expanded.
- `.github/workflows/validation.yml` exists and runs mobile typecheck, mobile presentation tests, and server tests.
- Fourteen Task 004 screenshots are referenced in the report.

## Required follow-up

### 1. Guide Quick Preview is not actually draggable

The accepted task required a draggable bottom sheet. The implementation uses a React Native `Modal` with `animationType="slide"` and a visual handle, but no pan gesture or sheet interaction. The UI is dismissible and scrollable, but not draggable.

Decision for next checkpoint:

- either implement real drag-to-dismiss using an existing approved sheet/gesture dependency;
- or explicitly revise the component contract to "modal bottom sheet" and remove the draggable requirement.

Do not add a new dependency without documenting maintenance and bundle cost.

### 2. Driving Approaching Target is not implemented or verified

Task 004 required Approaching Target support for walking and driving. The report states that driving approaching was not reachable and substitutes a Drive idle guest screenshot. This is not equivalent evidence.

The current walking `ApproachingTargetView` contains route-map presentation and standard interaction controls. It must not be reused automatically for Drive mode without a safety-specific design and state contract.

Required later safety checkpoint:

- define Drive approaching presentation;
- use audio-first reduced UI;
- test authenticated/backend-triggered state or a deterministic Drive presentation fixture;
- capture a genuine Drive approaching screenshot.

### 3. Small-device validation remains incomplete

The smallest screenshot was captured on iPhone 16e because an SE/mini simulator was unavailable. This is acceptable for this checkpoint, but does not close the small-screen requirement.

### 4. CI result is reported but not independently exposed through commit status

The workflow file is present. The report identifies successful run `29752580019`, but the connector returned no combined commit statuses for the implementation SHA. The workflow should remain, but future reports should include a workflow URL/run ID and preferably preserve test output as an artifact when failures occur.

## Architecture observations

- The new `guided_at_target` phase is correctly represented in the foreground selector.
- Arrival is no longer skipped when autoplay is disabled.
- Autoplay holds At Target for a deterministic 1800 ms before narration.
- Target media remains optional and outside pure demo data modules.
- No backend contract or provider integration change was introduced.

## Testing assessment

The deterministic harness is materially stronger than Task 003 tests, but it is still not a mounted React hook test environment. It validates controller/state-machine behavior rather than React lifecycle integration. This is acceptable for the current deterministic MVP, provided real-device regression checks continue.

## Final decision

Task 004 is accepted for the walking Guided Tour MVP path.

It does **not** close:

- draggable sheet behavior;
- Drive approaching UX/safety;
- true smallest-device validation.

These items must remain visible in the execution status and must not be reported as fully complete.