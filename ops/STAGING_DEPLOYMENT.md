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
- Separate staging media volume; separate JWT, OTP pepper, admin access code and keys. Staging allows only explicit test accounts. Set external provider quotas/billing caps separately; application rate limits are *not* a billing guarantee.
- `NODE_ENV=staging`, `AUTH_DISABLED=false`; `REALTIME_VOICE_PROVIDER=deterministic` is **infrastructure smoke only**, not a live voice-provider selection or benchmark pass.
- API is supplied as a **reviewed, SHA-tagged, off-VPS-built** linux/amd64 image. Never build on the 1.8 GiB production-host VPS during normal operation.

## Hard gates before deployment

1. Confirm head commit, CI status, staging source choice and image provenance. PR #19 includes PR #17's pending M4 work but does not mean that M4 acceptance has passed. Do not merge either PR.
2. Confirm `getent ahostsv4 staging-api.heycity.stolbergco.com` resolves to VPS; `ss -ltn '( sport = :4110 )'` shows no listener; `docker network ls` includes no accidental staging-to-production connection.
3. Record `free -m`, `df -h /`, `docker ps`, `docker stats --no-stream`; stop if host available memory is below 600 MiB at staging startup or production is unhealthy. Never build the API image on the VPS.
4. Obtain a restricted staging-provider key set and distinct randomly generated staging-only secrets through a trusted secret store, not commits/chat/logs. Reviewer must verify placeholders are absent without printing values. Populate `.env.staging` from `ops/staging.env.example`, protect mode 600 and restrict the containing directory. Only allowlisted tester emails; ensure Resend sender is verified.
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
