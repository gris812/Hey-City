# Hey City: staging API deployment (independent of production)

Status: **staging backend and standalone cloud iOS Release verified; physical installation/acceptance pending**. This is the single operational procedure for the API-only field-test staging environment. Live M4 B1–B6 acceptance and realtime-provider selection remain open.

## Confirmed baseline, 2026-10-16

- Production: `/opt/HeyCity-production`, Git checkout `848d77daa193a8383f0a8382ad702f5604244730`, Docker project `heycity-production`. PostgreSQL and media use production-only Docker volumes.
- Other tenant: LifehackVault PostgreSQL and Redis. Neither may be altered.
- VPS: ~1.8 GiB RAM, ~799 MiB available at read-only sample, **no swap**, 53 GiB free disk. Production idle containers collectively ~87.6 MiB, not a peak load test.
- Existing Nginx handles `heycity.stolbergco.com` -> loopback :4180 and `api.heycity.stolbergco.com` -> loopback :4100, with Certbot TLS. `heycity-deploy` has Docker access but no passwordless Nginx sudo.
- Staging DNS: `staging-api.heycity.stolbergco.com` A record resolves to the VPS. Local loopback :4110 was free at last check.

## Canonical staging design

- Separate `docker-compose.staging.yml` and **project name `heycity-staging`**. Staging files live outside `/opt/HeyCity-production`; never pass a production Compose file or project name to a staging command.
- **Two staging containers only:** API (384 MiB RAM cap, 1 CPU) and PostgreSQL 16 (192 MiB RAM cap, 0.75 CPU). Using a second small PostgreSQL container is deliberate: reusing the production DB instance would require connecting across/altering the production network and would increase blast radius. Reassess capacity if observed headroom is insufficient; do not silently switch to shared production PostgreSQL.
- Staging PostgreSQL uses a distinct internal Docker network, DB user, DB name and volume. API also uses a separate outbound network for Maps, LLM, TTS, Resend. Neither service joins `heycity-production_default` or publishes database port 5432.
- Staging API listens only on `127.0.0.1:4110` at the host; a distinct staging Nginx vhost terminates HTTPS. Production :4100/:4180 and existing vhosts do not change.
- Separate staging media volume and distinct database password, JWT secret, OTP pepper and admin access code. Staging allows only explicit test accounts. External provider credentials should normally be distinct; the narrowly scoped temporary exception below may reuse specified production provider keys. Set external provider quotas/billing caps separately where available; application rate limits are *not* a billing guarantee.
- `NODE_ENV=staging`, `AUTH_DISABLED=false`; `REALTIME_VOICE_PROVIDER=deterministic` is **infrastructure smoke only**, not a live voice-provider selection or benchmark pass.
- API is supplied as a **reviewed, SHA-tagged, off-VPS-built** linux/amd64 image. Never build on the 1.8 GiB production-host VPS during normal operation.

## Temporary shared external-provider credentials exception (operator-authorized 2026-10-16)

Default: use separate provider projects and keys. For the initial, short-lived, controlled staging field test, the operator **explicitly authorized temporary reuse** of existing production **`GOOGLE_MAPS_API_KEY`**, **`OPENAI_API_KEY`** and **`RESEND_API_KEY`**, plus the currently verified **`AUTH_FROM_EMAIL`** sender. This is an operational exception, **not** a change to the modular design or default security standard.

- **Never** reuse or copy production `.env` wholesale, `DATABASE_URL`, database credentials/volumes, `JWT_SECRET`, `OTP_PEPPER`, `ADMIN_AUTH_CODE`, SSH identities, auth sessions, user database, media or production API URL. Stage-only internal secrets, database, allowlist, Nginx hostname, Compose project and GitHub Environment remain separate.
- Copy only the three external API key **values** from an existing trusted secret store directly into the root-owned mode-600 staging env using an interactive editor; do not send them in chat, paste them into shell command arguments, print them with `cat`/`grep`, commit them, put them in GitHub Actions secrets, or expose them in CI/logs. The provider bills/quotas are **shared** while those keys are reused.
- Keep `NODE_ENV=staging`, `AUTH_DISABLED=false`, `REALTIME_VOICE_PROVIDER=deterministic`, and an explicit `TESTER_EMAIL_ALLOWLIST`; use a tester `ADMIN_EMAIL`. Verify staging OTP denies unallowlisted addresses **before** accepting broader testers, and audit any unauthenticated AI/Maps routes for abuse before public tests.
- Recheck provider-side quotas, usage, billing alerts and provider key restrictions **before** deployment. Per-user API rate limits and provider *budget alerts* do **not** guarantee a hard spending stop; shared quotas can disrupt production, and a compromised staging API can expose the production provider credentials. Do not claim financial isolation or a zero-risk rollback.
- Revisit the exception after the initial field test: create restricted staging-only provider keys/projects and rotate any shared production keys if exposure is suspected. Do not assume this exception covers future stages, additional providers or use of the production deployment SSH key.

## Public guest exposure — accepted temporary operator exception (2026-10-16)

The sole field tester stated that they do **not** want a new guest-access gate for this initial round. The **Guest-first product behavior must remain unchanged**, including on staging, and a new token in the internal iOS app would add complexity and rebuild requirements. The previous proposed staging guest access gate is therefore **deferred**, not implemented.

This does **not** make the staging host private. Code review of PR #19 established:
- `server/src/middleware/auth.ts` allows a syntactically valid, self-declared `x-hey-city-guest-id` through `requireAuthOrGuest`. The login tester email allowlist is **not** a security boundary for these guest routes.
- `server/src/routes/drive.ts` (200 requests / 15 min / IP) and `server/src/routes/canonical.ts` voice samples (30 requests / 15 min / IP) are guest accessible; these can trigger **billable** Google Maps or OpenAI calls.
- `server/src/services/budget.ts` uses per-user **in-memory** counters for the legacy Places/Matrix path, while `googleAheadDiscoveryProvider.ts` uses its own caches rather than the same per-user budget, so these limits are not global hard spending caps. Guest identifiers/IPs can change.

**Operational go/no-go before shared-key staging use:** verify the existing external provider credentials remain valid for the staging VPS/usage, configure provider-side quota restrictions where compatible with production traffic and billing alerts, and retain the staging-only rate limits and one-person test scope. Quota changes to a *shared* Google API key/project may limit production too; avoid tightening production without verifying impact. No application or alert provides a guaranteed hard stop for all charges. Review public routes and logs, do a short monitored test and stop **staging only** on abnormal usage. If these operational gates cannot be established, create distinct staging provider credentials or an access gate before opening shared-key field testing.

This is a **bounded acceptance of residual cost risk**, not proof that arbitrary internet clients cannot use guest routes, and does not authorize broad public beta, production deployment, or choosing an M4 realtime provider. Revisit access isolation before adding testers, scaling traffic or keeping staging permanently available.

## First-installation gates — historical baseline

1. Confirm head commit, CI status, staging source choice and image provenance. PR #19 includes PR #17's pending M4 work but does not mean that M4 acceptance has passed. Do not merge either PR.
2. Confirm `getent ahostsv4 staging-api.heycity.stolbergco.com` resolves to VPS; `ss -ltn '( sport = :4110 )'` shows no listener; `docker network ls` includes no accidental staging-to-production connection.
3. Record `free -m`, `df -h /`, `docker ps`, `docker stats --no-stream`; stop if host available memory is below 600 MiB at staging startup or production is unhealthy. Never build the API image on the VPS.
4. Generate distinct staging DB/JWT/OTP/admin secrets and supply external-provider credentials through a trusted secret store, never commits/chat/logs. Independent provider keys are preferred; the *explicitly authorized, narrow temporary exception* below permits Google Maps, OpenAI and Resend keys only. Reviewer must verify placeholders are absent without printing values. Keep `.env.staging` root-owned mode 600, allow only explicit tester emails, and ensure Resend sender is verified.
5. Confirm a trusted server administrator can add one isolated Nginx vhost and issue one new Certbot certificate. Do not give the deployment account broad, permanent root privileges.
6. Verify `docker image inspect "$STAGING_API_IMAGE"` and its OCI `org.opencontainers.image.revision` label match the approved source SHA.

## First-installation checklist — routine releases use STAGING_AUTOMATION.md

Work from a **separate** workspace, e.g. `~/HeyCity-staging` owned by `heycity-deploy`, containing just the approved staging Compose file and `.env.staging`. Do not copy `.env.production`, the production DB, media or Docker networks.

Build off-server on a trusted machine from a clean checkout of the reviewed SHA for **linux/amd64**. Example after setting `SHA` to the actual reviewed commit and checking that the checkout equals it:

```bash
docker buildx build --platform linux/amd64 -f server/Dockerfile \
  --label "org.opencontainers.image.revision=$SHA" \
  -t "heycity-staging-api:git-$SHA" --output type=docker .
docker image inspect "heycity-staging-api:git-$SHA" \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
```

Transport the trusted image to the VPS using an approved secure image transfer/registry; do not depend on an unverified GHCR repository. If using Docker streaming, use a pre-approved SSH login and `docker save IMAGE | ssh DEPLOY_USER@VPS 'docker load'`, without exposing SSH keys in the command, CI logs or repository. Check the image architecture is `amd64`, SHA tag and embedded revision label match, and avoid exposing image environment.

Create `.env.staging` from `ops/staging.env.example` in that staging workspace; set `STAGING_API_IMAGE=heycity-staging-api:git-<reviewed SHA>`. Populate secrets securely, generate hex-only database password (safe in database URI), then:

```bash
chmod 600 .env.staging
docker image inspect "$(sed -n 's/^STAGING_API_IMAGE=//p' .env.staging)" >/dev/null
docker compose --project-name heycity-staging --env-file .env.staging \
  -f docker-compose.staging.yml config --quiet
docker compose --project-name heycity-staging --env-file .env.staging \
  -f docker-compose.staging.yml up -d --no-build
curl --fail --silent --show-error http://127.0.0.1:4110/health
docker compose --project-name heycity-staging --env-file .env.staging \
  -f docker-compose.staging.yml ps
free -m
docker stats --no-stream
```

**Never** print `docker compose config` without `--quiet` because it expands sensitive environment values. Do not use `--remove-orphans`, `down -v`, production Compose, or `docker system prune`. If free host memory drops below 200 MiB, memory pressure grows, or production health deteriorates, stop **only** staging containers immediately and preserve their volumes for diagnosis.

### Admin-only: separate Nginx staging host and certificate

Nginx has an active production configuration and existing Hackshelf host. Only a trusted admin should perform the following; always back up the existing config *without copying secret file contents into reports*. Never edit `/etc/nginx/sites-enabled/heycity` or `hackshelf`.

1. Confirm Certbot and Nginx permissions, absence of an existing staging vhost and safe shared TLS includes. Create an ACME challenge webroot `/var/www/letsencrypt/.well-known/acme-challenge`.
2. Install `ops/nginx-staging-http.conf.example` as a **new** `sites-available/heycity-staging` file and enable a new `sites-enabled/heycity-staging` symlink. Run `nginx -t`, then reload Nginx only after passing. This HTTP-only vhost serves challenges but no API.
3. Issue the staging-only certificate using `certbot certonly --webroot -w /var/www/letsencrypt -d staging-api.heycity.stolbergco.com`. Do not request changes to any existing production certificate.
4. Replace **only** the newly added staging vhost using `ops/nginx-staging-https.conf.example`, after confirming the new certificate exists and Certbot TLS includes exist. Run `nginx -t` before each reload.
5. Confirm certificate renewal mechanism, HTTPS validity, `/health` and `/guides` over the staging hostname. Test OTP allowlist, approved test sign-in, asset paths, rate limits and recorded API usage; never print tokens, OTP values or credentialed requests.

Nginx reload affects the shared Nginx process; it must be scheduled cautiously and followed by a smoke check that production `https://api.heycity.stolbergco.com/health` and `https://heycity.stolbergco.com` still work.

## iOS standalone internal preview (replaces development build)

Scope: physical iPhone, bundled production-mode JavaScript, no Metro/Mac or live reload. This **does not** select an M4 realtime voice provider or certify M4 B1–B6. The backend stays at the separately reviewed staging SHA; an iOS build from a later UI/config commit may legitimately have a different source SHA.

- `mobile/eas.json` profile `preview` uses `distribution: internal`, `developmentClient: false`, `environment: preview`, `ios.simulator: false`. The app retains the existing `ios.bundleIdentifier = com.sunshine.aiguide` so it **replaces**, rather than co-installs alongside, the current development app on the iPhone. Be aware of locally stored SecureStore auth tokens and user preferences; verify replacement behavior and perform fresh OTP login if the token is no longer valid. If iOS refuses to install over an existing differently signed development build, removing that old app may be necessary and will erase its local data. No separate staging Bundle ID is created.
- The preview build profile pins the nonsecret `EXPO_PUBLIC_API_URL=https://staging-api.heycity.stolbergco.com`. Check that the Expo EAS `preview` environment does not define a conflicting value; build-time environment values are included in the app JS bundle.
- `EXPO_PUBLIC_M4_NATIVE_BENCHMARK_ENABLED=false` and `developmentClient: false` explicitly disable the native development benchmark UI. The staging server remains `REALTIME_VOICE_PROVIDER=deterministic`: this build is for independent Core UX/HTTPS/Maps/auth checks, **not** final live M4 voice acceptance.
- **Required external EAS preparation:** Log into the correct Expo project (project ID is in `mobile/app.config.js`); configure `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY` in the **Expo EAS `preview` environment** with **sensitive** visibility (accessible to native config evaluation), not GitHub and not the VPS. Reuse the existing iOS Maps SDK key if its Google Cloud restriction permits bundle ID `com.sunshine.aiguide` and Maps SDK for iOS; do **not** place the server-side Maps key or OpenAI/Resend secrets in `EXPO_PUBLIC_*`. No provider key values belong in committed `eas.json`.
- Verify Apple Developer access, Expo/EAS project permissions, existing iPhone UDID registration and valid ad hoc provisioning profile. Internal iOS builds can require interactive Apple login/credentials management. If a device is missing from the provisioning profile, update/register it before installing the build; an EAS cloud build can run without the Mac staying powered on once upload is finished.
- From a clean Mac checkout of the **reviewed preview branch/commit** (do not merge into `main`), run in `mobile/`: `npx eas-cli@27.5.0 whoami`; `npx eas-cli@27.5.0 build --platform ios --profile preview`. Before publishing any install link, validate build provenance in Expo dashboard and confirm the chosen source revision, bundle ID, profile and project.
- Install the resulting internal distribution build from the EAS link on the registered iPhone. Turn **off the Mac**, disconnect home Wi-Fi, and test on cellular: app launches without Metro; map renders; location permissions and live position work; guest onboarding; allowed tester sign-in; `/guides`; narration/voice-sample behavior (identify expected deterministic or unavailable live voice); interruptions; production API remains healthy; staging VPS memory and shared provider spending stay within the previously accepted limits. **Authentication nuance:** the configured `ADMIN_EMAIL` uses the staging-only `ADMIN_AUTH_CODE` from the root-owned env file rather than a Resend email OTP; never expose the code in logs/chat. A separate allowlisted non-admin email receives OTP via Resend.
- Do **not** add `developmentClient:true` to preview, embed provider secrets, merge the stacked PR chain, update production, or claim that backend `/health` `buildSha=unknown` establishes code provenance. Use the image OCI revision label for backend verification and EAS build revision for iOS.

## Image identity, acceptance and rollback — PR #31

**Resolved on the VPS:** [inspect run #2, attempt 2](https://github.com/gris812/Hey-City/actions/runs/42316561697) used the installed restricted receiver and verified source `bb6a9ad539c7fb6db433671c602a51e63c45d9e5`, exact historical config `sha256:6b2eb1a9260f69216248774f88d1b4dad89d314d1ba65888bb54ac1aa61a246b` and all 13 actual filesystem layers. Docker Engine is **29.1.3**, store driver `io.containerd.snapshotter.v1`. Displayed `.Id` `sha256:c757151f1692ad455250796f54beecfa58cf9f0ce3b5098b93c1d67a0b362ac5` exactly matched an exported **manifest** digest (`engine_id_kind=manifest`), not the config digest. This establishes the actual root cause: different identity objects under containerd, not evidence of modified config/layers. No retag bypass was used. Source SHA, compressed/archive checksum, config digest and manifest/index digest remain distinct concepts.

**Actual deployment:** [staging run #3](https://github.com/gris812/Hey-City/actions/runs/42322157592) built a fresh linux/amd64 image from that same approved source on a GitHub runner, compared exact config/layers before and after import, activated only staging API and passed running-image correspondence, source/capability health, public HTTPS, restart stability and unchanged production-health checks. This fresh build has its own identity; it is not claimed to be the old CI #237 archive.

| Release receipt | Verified value |
|---|---|
| Application source | `bb6a9ad539c7fb6db433671c602a51e63c45d9e5` |
| Config digest | `sha256:0c47fb12389ce012d72938594ec45d07d06b91062b368d0a4123dd75baa2b173` |
| Deployed Docker image ID (index) | `sha256:c1be13c2fe32265a62ba4afd287df19fb6811129e6c7b389eba5f51659fdfc3a` |
| Transferred uncompressed TAR SHA256 | `ff761c4ae0815949478cff281e9870140addceabd50d6bcbe1f467a1b04b509c` |
| Retained previous image | `sha256:676876540669e76d12b0c05ba0c53f8e58152bde87270b2ac60a7ae403bf1502` / source `9c6fcfc99332de1ecb9502df1b4918fc579d8967` |
| Rollback tag | `heycity-staging-rollback:20261107010734` |
| Deployment preflight | 660 MiB available RAM; 52,187,832 KiB free disk; existing PostgreSQL healthy |
| Runtime tooling / active workflows | `eb7fb8e0eb8f1b7c17d30ea460a7cc4b58eff3cb` / `97fce755c2e7d24b5b3c9acd228acae1b1b728ae` |

Production Compose/credentials/database/Nginx and staging DB/media services/volumes were not managed by this API-only deployment. Production local/public health passed before/after, with unchanged public response. Automated failure/rollback regressions pass and the previous image is retained; a deliberate live failure/restore drill and sustained-load test have not been executed on this shared VPS. Signed iOS distribution and installation preparation now pass via iOS workflow #2; see the canonical binary receipt in STAGING_AUTOMATION.md. Physical installation/field acceptance remains open. The operational release automation is verified; this does not certify physical app behavior.

Because the original config digest above was independently verified, it already cryptographically binds the complete configuration and ordered filesystem diff IDs. A new export can be verified against it **without recovering the expired original TAR**. For the historical proof, read-only `inspect FULL_SHA sha256:EXPECTED_CONFIG` through the existing forced command / staging workflow (`operation=inspect`) was used. This operation exports the already loaded SHA tag, verifies exact config and actual ordered layers, prints safe engine version/store metadata, and classifies the display ID against exported config/manifest/index digests. It performs no `docker load`, build or Compose mutation. See `STAGING_AUTOMATION.md` for the exact historical command.

For a current audit, an administrator may export the current SHA tag and verify it offline against the **new deployment #3 config** below. The historical 6b2eb1a digest applies only to the pre-deployment image:

```bash
python3 ops/image_identity.py loaded-image.tar \
  --sha bb6a9ad539c7fb6db433671c602a51e63c45d9e5 \
  --config-digest sha256:0c47fb12389ce012d72938594ec45d07d06b91062b368d0a4123dd75baa2b173
```

If the original archive is available, `--compare other-export.tar` remains an optional full transport/config/layer comparison; `diagnose FULL_SHA` accepts that original uncompressed TAR on stdin. Archive checksums identify the compressed transport bytes and need not equal either image digest. Do not print runtime configuration. Record `docker version --format '{{json .Server.Version}}'` and `docker info --format '{{json .DriverStatus}}'` with the digest report.

The verifier hashes exact config bytes (labels/history/config included without disclosure), verifies every ordered rootfs layer's uncompressed digest, rejects unsafe/duplicate/malformed/config/platform/revision mismatches, and compares the loaded re-export. It prints only safe digest metadata. A different display ID is accepted only after this byte-level content proof, not because labels match. If the config or layers differ, stop deployment; preserve evidence and do not force-retag. If the display ID matches a re-exported manifest/index descriptor, record that correspondence with the store/version evidence. If no correspondence can be shown, report content equivalence separately from the unresolved display-ID explanation.

For subsequent deployments, follow `STAGING_AUTOMATION.md`: repeat live preflight rather than relying on the receipt above. Prior `buildSha=unknown` is superseded by matching `bb6a9ad…` from deployment #3. PR #31 adds no schema change; `server/src/services/database.ts` is unchanged from historical running-source `9c6fcfc…` to its reviewed source, and the deployment #3 PostgreSQL health preflight passed. Recheck DB health on subsequent releases. Do not run destructive migrations or restore production data.

The receiver records the actual previous container image ID/revision and tags that exact image for rollback before activation. It starts only staging `api` with `--no-deps --no-build --pull never`, leaving PostgreSQL/media volumes intact. Acceptance requires exact running-image correspondence, staging source/capability health locally and via HTTPS, stable running/restart count, and unchanged production health. If activation fails, restore the retained image automatically and verify both its running ID and pre-deployment health; report `rollback_health_verified=0` as an incident needing administrator action. No image pruning, database rollback, Nginx edits or production changes occur. Rollback restores application code only; it cannot undo application writes, and short smoke/restart checks do not prove sustained load stability.

A successful receiver returns source/current image ID, previous ID/revision and rollback tag. Workflow summaries retain archive/config identity plus this receipt. Root-owned code installation and the actual rollback drill are operational gates, not proven by CI mocks. Retain the known-good tag until replacement acceptance; never use `down -v`, `--remove-orphans` or `docker system prune`. A later independent runner HTTPS failure after the receiver exits is reported as failure for operator investigation; never claim that post-return outage was automatically rolled back.

Physical iPhone checklist after signed standalone installation: cold launch with Mac off/no Metro; cellular HTTPS; GPS/map; walking→vehicle→stop→walking; actual narration identity and audio failure/completion; explicit short story/supersede/unavailable; compass/course/north/pan/follow; metric/imperial persistence; foreground keep-awake and release on session end; Dana/Arthur portraits/swipe; admin/guest authentication and RU Settings. Manual-lock background GPS/audio is a separate test and is not certified by keep-awake. Physical tests must be recorded by the device owner.

## Native field retest release — 2026-10-26

This pass changes the server contract for unknown speed, guest explicit selection and idempotency; testing the final native client against the older staging backend is insufficient. **Backend deployment is now complete** via staging run #3 from the reviewed source; standalone native cloud build **1.0.0 (2)** passed via [iOS workflow #2](https://github.com/gris812/Hey-City/actions/runs/42539842202); physical installation/retest remains pending. The [install page](https://expo.dev/accounts/stolberg-usa/projects/hey-city/builds/8fe83d09-617d-448f-9a43-ce352779e7bc) and binary identity receipt are recorded in STAGING_AUTOMATION.md. Production is unchanged.

CI checks out the exact PR head and embeds `GIT_SHA`/OCI revision into the API image. An optional manual validation dispatch can publish `staging-api-<full-head-sha>` after validation; normal PR/push CI retains no large image artifact. The staging release workflow builds the reviewed source on its runner and streams it directly to the restricted receiver, independently of that optional export. It contains `api.tar.gz`, `SHA256SUMS` and `provenance.json` (source SHA, Docker image ID/content digest, architecture and OS). This is a verified image artifact, not a registry push or deployment. Confirm the archive checksum, linux/amd64, source label and image ID before using the existing forced `deploy <SHA>` command; decompress the gzip archive to Docker tar on stdin. Keep the previous reviewed staging image (`9c6fcfc99332de1ecb9502df1b4918fc579d8967`) available for rollback; the running image must still be confirmed immediately before replacement. Never build on the VPS. Record `/health.buildSha`, imported image ID and staging-only health after apply. On failure, restore that recorded previous image through the same staging-only procedure; retain database/media volumes.

On the existing Mac checkout, fetch the final native-controls Draft branch and check out its exact reviewed full SHA. Run `bash ops/build-ios-field-release.sh <full-reviewed-sha> [device-UDID]`. The script uses the existing `mobile/ios`, incremental `pod install`, and Release with bundled JS, without Metro or clean prebuild. It stamps source SHA and **CFBundleVersion `2026.10.26`**, retaining Personal Team, bundle ID and existing `ENABLE_USER_SCRIPT_SANDBOXING=NO` configuration. It requires the local signed native project; it does not create a new signing identity. Native code must be rebuilt after adding the direct Expo keep-awake dependency. Check the installed version/SHA in Settings before unplugging Mac and cold-launching on cellular.

Automated tests alone do **not** establish iOS execution. The signed cloud IPA is now built and inspected (see the canonical receipt in STAGING_AUTOMATION.md); the agent Linux environment has no local Xcode, simulator or physical iPhone. Installation and physical behavior remain owner acceptance gates. Existing background audio/GPS under manual screen lock is not certified by this foreground keep-awake change.
