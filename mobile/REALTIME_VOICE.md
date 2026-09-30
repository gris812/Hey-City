# M4 realtime voice: native development path

Realtime microphone streaming uses native modules: OpenAI uses
`react-native-webrtc`; Gemini uses native PCM capture/playout over a constrained
ephemeral WebSocket. Expo Go does not contain these modules, so M4 voice must be
tested with a development/native build.

```sh
npx expo prebuild
npx expo run:ios
# or
npx expo run:android
```

For a shared internal build:

```sh
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

No provider API key is stored in the application bundle. The authenticated
Hey City API creates a session-scoped connection: OpenAI uses a server-mediated
WebRTC SDP exchange and Gemini uses a single-use short-lived token. Provider
wire events stay inside transport codecs; only final normalized turns enter M3.

## B1-B6 field build

Set these non-secret build variables for the development profile:

```sh
EXPO_PUBLIC_M4_NATIVE_BENCHMARK_ENABLED=true
EXPO_PUBLIC_GIT_SHA=$(git rev-parse HEAD)
```

Start the server with the explicit non-production override gate:

```sh
M4_NATIVE_BENCHMARK_PROVIDER_OVERRIDE_ENABLED=true npm run dev:server
```

The in-app benchmark control selects `openai` or `gemini` before Talk and uses
the same M3 lifecycle for both. Close Talk after each repetition, select the
next B1-B6 scenario, then export the JSON artifact. Benchmark transcripts are
controlled test data stored only in that artifact; product `usage_events` keep
their existing transcript-free allow-list.
