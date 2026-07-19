# Location Source and Simulation

## Location source boundary

Mobile location input is normalized to `LocationEvent`:

- latitude
- longitude
- heading
- speedKmh
- timestampMs
- optional accuracyMeters

Application code should consume a `LocationSource`, not raw provider objects.

Implemented sources:

- `RealLocationSource`
- `SimulatedLocationSource`

## Dev-only simulation

The simulator is a developer tool and must not appear in production UI.

It emits only movement events. It does not choose places, stories, targets, or guide output.

The first deterministic fixture is `FiDi Walking Demo`, a short walking sequence near Federal Hall / Wall Street. The fixture includes ordered coordinates, headings, timestamps, walking speeds, and a short pause. The same fixture produces the same event sequence each run.

Manual route input UI is present as a development shell. Mobile routing/geocoding provider integration is not connected in this slice, so fixture coordinates remain the working source.

## Integration pipeline

Real or simulated `LocationSource`
-> normalized `LocationEvent`
-> existing mobile location/session pipeline
-> backend session API when available
-> typed presentation mapper
-> UI

## Anonymous backend-session gap

Guest startup cannot perform end-to-end backend discovery yet because the current backend protects session/discovery endpoints.

Protected blockers include:

- `POST /drive/session/start`
- `POST /drive/session/ping`
- `POST /drive/session/story/finish`
- `POST /drive/poi/candidates`
- canonical `/sessions`
- canonical `/discovery`
- canonical `/stories`
- canonical `/pois`

Until an anonymous session contract exists, guest City Explorer stays in a local exploring state and must not fabricate backend stories or targets.

## First Story boundary

Mobile may prepare future request context:

```ts
type FirstAreaIntroductionContext = {
  latitude: number;
  longitude: number;
  guideId: 'dana' | 'arthur';
  guideLanguage: 'en' | 'ru';
};
```

The mobile client must not generate the production first story. That remains a backend story-generation responsibility once the guest session contract exists.
