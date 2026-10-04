# M4 realtime voice: native development path

Realtime microphone streaming uses native modules: OpenAI uses
`react-native-webrtc`; Gemini uses native PCM capture/playout over a constrained
ephemeral WebSocket. Expo Go does not contain these modules, so M4 voice must be
tested with a development/native build.

## Physical iPhone API requirement

Metro tunnel only delivers JavaScript. It does **not** make the Hey City API
reachable.

A physical iPhone must never rely on the mobile fallback
`http://localhost:4000`: on the phone, `localhost` means the phone itself.

For PR #17 field testing, run the PR #17 backend separately from production and
point the development JS bundle at that backend.

### Local Mac branch backend

Use this when the Mac and iPhone are on the same reachable network.

1. On the Mac, from the PR #17 checkout, create/update `mobile/.env`:

```sh
EXPO_PUBLIC_API_URL=http://<MAC_LAN_IP>:4000
EXPO_PUBLIC_M4_NATIVE_BENCHMARK_ENABLED=true
EXPO_PUBLIC_GIT_SHA=$(git rev-parse HEAD)
```

Do not put OpenAI/Gemini keys in `mobile/.env`.

2. Start the PR #17 API on the Mac with its **server-side** development
credentials/config:

```sh
GIT_SHA=$(git rev-parse HEAD) \
M4_NATIVE_BENCHMARK_PROVIDER_OVERRIDE_ENABLED=true \
npm run dev:server
```

3. Verify from Safari on the iPhone:

```text
http://<MAC_LAN_IP>:4000/health
```

The response must identify `hey-city-api` and include capability
`m4_realtime_voice`. A production/main backend without that capability is not
compatible with the PR #17 benchmark client.

4. Start Metro:

```sh
npm run dev:mobile
```

Reload the development client. Changing `EXPO_PUBLIC_API_URL` in the Metro JS
environment normally needs a Metro restart/reload, not a new native build.

If local-LAN access is impossible, provision an isolated HTTPS staging backend
from the PR #17 branch. Do not replace the production deployment and do not
merge PR #17 merely to obtain backend access.

## Native build

For a local native build:

```sh
cd mobile
npx expo prebuild
npx expo run:ios --device
```

For a shared internal build:

```sh
cd mobile
npx eas build --profile development --platform ios
```

The native build is required after changes to native config/plugins such as
microphone permissions, WebRTC/AudioStudio/Audio API plugins, or the app display
name. Pure JS/UI/API URL changes can then be delivered through Metro reload.

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

The in-app benchmark control selects `openai` or `gemini` before Talk and uses
the same M3 lifecycle for both. Close Talk after each repetition, select the
next B1-B6 scenario, then export the JSON artifact. Benchmark transcripts are
controlled test data stored only in that artifact; product `usage_events` keep
their existing transcript-free allow-list.
