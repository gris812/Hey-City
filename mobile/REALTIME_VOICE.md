# M4 realtime voice: native development path

Realtime microphone streaming uses `react-native-webrtc`. Expo Go does not
contain that native module, so M4 voice must be tested with a development or
native build. The existing non-voice application remains usable in Expo Go.

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

