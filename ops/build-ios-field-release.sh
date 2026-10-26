#!/usr/bin/env bash
# Build exactly one reviewed standalone Release in the existing signed Mac checkout.
set -euo pipefail
expected_sha="${1:?Usage: bash ops/build-ios-field-release.sh FULL_REVIEWED_SHA [DEVICE_UDID]}"
[[ "$expected_sha" =~ ^[a-f0-9]{40}$ ]] || { echo 'Use the full reviewed source SHA.' >&2; exit 64; }
[[ "$(uname -s)" == Darwin ]] || { echo 'Requires the existing Mac/Xcode Personal Team checkout.' >&2; exit 69; }
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
[[ "$(git rev-parse HEAD)" == "$expected_sha" ]] || { echo 'Checkout does not match the reviewed source SHA.' >&2; exit 65; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Commit or stash tracked source changes before the Release build.' >&2; exit 65; }
[[ -d mobile/ios ]] || { echo 'Use the existing mobile/ios project to preserve Personal Team/Xcode settings. This script does not prebuild it.' >&2; exit 69; }
export EXPO_PUBLIC_GIT_SHA="$expected_sha"
export EXPO_PUBLIC_API_URL=https://staging-api.heycity.stolbergco.com
export EXPO_PUBLIC_M4_NATIVE_BENCHMARK_ENABLED=false
export HEY_CITY_FIELD_BUILD_NUMBER=2026.10.26
cd mobile
# Incremental autolinking only; keep the native project, team and sandboxing settings.
(cd ios && pod install)
(cd ios && xcrun agvtool new-version -all "$HEY_CITY_FIELD_BUILD_NUMBER")
release_args=(--configuration Release --no-bundler --no-install --device)
if [[ -n "${2:-}" ]]; then release_args+=("$2"); fi
npx --no-install expo run:ios "${release_args[@]}"
printf 'Release source: %s\nBuild number: %s\n' "$expected_sha" "$HEY_CITY_FIELD_BUILD_NUMBER"
echo 'Verify installed version/SHA in Settings, then unplug Mac and cold-launch over cellular.'
