# Hey City: staging API deployment (independent of production)

Status: **deployment prepared, not executed**. This is the single operational procedure for the API-only field-test staging environment. Live M4 B1–B6 acceptance and realtime-provider selection remain open.

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

## Hard gates before deployment

1. Confirm head commit, CI status, staging source choice and image provenance. PR #19 includes PR #17's pending M4 work but does not mean that M4 acceptance has passed. Do not merge either PR.
2. Confirm `getent ahostsv4 staging-api.heycity.stolbergco.com` resolves to VPS; `ss -ltn '( sport = :4110 )'` shows no listener; `docker network ls` includes no accidental staging-to-production connection.
3. Record `free -m`, `df -h /`, `docker ps`, `docker stats --no-stream`; stop if host available memory is below 600 MiB at staging startup or production is unhealthy. Never build the API image on the VPS.
4. Generate distinct staging DB/JWT/OTP/admin secrets and supply external-provider credentials through a trusted secret store, never commits/chat/logs. Independent provider keys are preferred; the *explicitly authorized, narrow temporary exception* below permits Google Maps, OpenAI and Resend keys only. Reviewer must verify placeholders are absent without printing values. Keep `.env.staging` root-owned mode 600, allow only explicit tester emails, and ensure Resend sender is verified.
5. Confirm a trusted server administrator can add one isolated Nginx vhost and issue one new Certbot certificate. Do not give the deployment account broad, permanent root privileges.
6. Verify `docker image inspect "$STAGING_API_IMAGE"` and its OCI `org.opencontainers.image.revision` label match the approved source SHA.

## Execution checklist (authorized staging only)

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

## Acceptance and rollback

Acceptance evidence: the *actual running* API image digest and revision, staging Docker project/network/volume names, no production database/media mounts, `NODE_ENV=staging` protection, local and public HTTPS health, 403 for unallowlisted OTP, permitted tester OTP delivery, published guide media over HTTPS, no new externally bound DB ports, stable RAM under small controlled load, production API/WebApp health unchanged, and provider costs within limits. Native offline internal build and live B1–B6 are separate gates.

Rollback on staging failure: `docker compose --project-name heycity-staging --env-file .env.staging -f docker-compose.staging.yml stop`; disable only the staging Nginx vhost, validate Nginx and reload. **Retain** staging volumes for investigation; never touch production storage, containers or DNS. A future production deployment/merge requires separate explicit approval.
