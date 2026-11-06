# Hey City staging automation — installation and activation

Status: **prepared, not deployed**. This document and the staging-only server scripts are in Draft PR #19. The manual activation workflow is isolated in Draft PR #20. The canonical application/Compose/TLS setup is in the adjacent ops/STAGING_DEPLOYMENT.md.

## Architecture

The current `heycity-deploy` is Docker-enabled: membership in Docker effectively grants root-level access to ALL containers on this VPS. Reusing that login or the production GitHub SSH secrets for staging is prohibited.

The automation instead uses a new locked-password account `heycity-staging-ci`, with **no Docker group and no unrestricted sudo**. Its root-owned `authorized_keys` forces `ops/heycity-staging-ssh`, accepting only `deploy <40-hex Git SHA>`. A sudoers rule allows only the root-owned `/usr/local/sbin/heycity-staging-deploy` helper. The helper validates the incoming Docker image archive and Git revision label and updates **only** `heycity-staging`, using a root-owned staging Compose manifest and separate root-owned environment file.

The Actions workflow is `workflow_dispatch` **only**, executable exclusively from `main`. It requires the requested SHA to equal the separately approved GitHub **staging environment variable** `STAGING_APPROVED_SHA`, and requires a successful `validate` check on that SHA. It builds on GitHub-hosted runners without server keys, then transmits the image using separate staging SSH secrets. It has no PR event and no production deploy step.

This does not provide complete VPS isolation: all projects share the host, Docker daemon and memory. Keep resource caps; do not grant the staging account Docker access.

## One-time setup (operator/admin)

1. Review and pin both this automation PR and PR #19 (including their CI). **Do not merge PR #17, #18, #19 or this PR without separate explicit approval.** Confirm `PRODUCTION_DEPLOY_ENABLED` cannot launch a production deploy from any planned change to `main`.
2. On Mac, create a **new** dedicated SSH key:

   ```bash
   ssh-keygen -t ed25519 -f "$HOME/.ssh/heycity-staging-ci" -C heycity-staging-ci -N ''
   chmod 600 "$HOME/.ssh/heycity-staging-ci"
   ```

   Never reuse `~/.ssh/heycity-deploy`. Do not paste the new private key into a chat or commit it. The **public** `heycity-staging-ci.pub` goes to the VPS administrator; the private key is entered directly into the GitHub *staging* environment secret.
3. For the **SSH access bootstrap only**, staging credentials are not required yet. Later, prepare a separate, untracked `.env.staging` on the VPS from PR #19's `ops/staging.env.example`, permission `600`, with staging-only JWT/OTP/database credentials, external-provider credentials subject to the narrowly scoped temporary exception in `ops/STAGING_DEPLOYMENT.md`, tester allowlist, quotas, Resend sender and `NODE_ENV=staging`. **Never copy the production env file, DB, media, authentication secrets or SSH credentials.** Only the specifically authorized three provider-key values may temporarily be reused. Do not print this file or share credential values.
4. Use an administrator/root VPS session to install *reviewed source files*, not ad hoc shell fetched from a URL. In a temporary isolated workspace, place `ops/heycity-staging-ssh`, `ops/heycity-staging-deploy`, `ops/bootstrap-staging-deployer.sh` from this PR and `docker-compose.staging.yml` from PR #19, validating source SHAs. Run:

   ```bash
   bash ops/bootstrap-staging-deployer.sh /path/to/heycity-staging-ci.pub
   # Later, root installs .env.staging separately, with owner=root and permissions=600
   sudo -l -U heycity-staging-ci
   id -nG heycity-staging-ci
   ```

   The bootstrap creates the locked account, forced command, root-owned staging Compose file and restricted sudoers entry. It refuses to overwrite an existing setup. It can optionally accept a ready mode-600 staging environment file as a second argument, but SSH-only setup does not need one. No production Docker or Nginx changes occur. Confirm the staging user is **not** in group `docker`.
5. Install a **new** Nginx staging vhost and Certbot certificate for `staging-api.heycity.stolbergco.com` per PR #19's two-phase Nginx templates. Do not modify the current `heycity` or `hackshelf` vhosts or their certificates. Root admin must run `nginx -t` before each reload and recheck production HTTPS afterwards.
6. In GitHub `gris812/Hey-City` Settings → Environments, create environment `staging`, restrict deployment branch to `main`, and add a required reviewer if available. Configure:

   | Name | Scope | Value |
   |---|---|---|
   | `STAGING_APPROVED_SHA` | Environment **variable** | Reviewed PR #19 source SHA with passing CI |
   | `STAGING_SSH_HOST` | Environment **secret** | VPS SSH host |
   | `STAGING_SSH_USER` | Environment **secret** | `heycity-staging-ci` |
   | `STAGING_SSH_PRIVATE_KEY` | Environment **secret** | The new, dedicated SSH private key |
   | `STAGING_SSH_KNOWN_HOSTS` | Environment **secret** | Pre-verified VPS SSH host-key entry |

   Do not use production SSH secrets. Staging API vendor credentials remain **on VPS only**, never in GitHub Actions.

## Activation gate

GitHub `workflow_dispatch` workflows must be available on the default branch. This Draft PR is not an active deployment. After separate review and **explicit authorization**, activate only the workflow-only PR #20 on `main`, verifying that no existing production workflow triggers in consequence. Then manually run Actions → **Hey City staging deploy (manual, isolated)** from `main`, passing the exact approved SHA. The workflow builds and uploads one image through the forced staging-only SSH command, then checks public staging HTTPS and unchanged production HTTPS.

If any required environment configuration, permission restriction, successful CI or HTTPS certificate is missing, **stop**; never fall back to production SSH keys/account, database or authentication secrets, and never run the workflow from an unreviewed PR branch. The limited and explicitly authorized sharing of three *external provider* key values is documented in `ops/STAGING_DEPLOYMENT.md`.

## Acceptance / rollback

Acceptance requires that the staging identity cannot open a shell or use Docker/sudo outside its forced command; invalid SHA and malformed image are rejected; running image revision is recorded; API remains loopback `127.0.0.1:4110`; DB/media networks and volumes do not connect to production; public staging HTTPS health and production HTTPS health both pass. Test OTP, media, spending budgets, native build and live M4 B1–B6 separately.

On staging failure, the receiver stops only staging services, retaining staging DB/media for diagnosis. Administrator rollback must use the previous reviewed staging SHA and never use `docker system prune`, `down -v`, production project, or production SSH credentials.

**Not completed here:** VPS bootstrap, GitHub environment/secrets, Nginx/Certbot setup, actual deployment, native iOS build, M4 acceptance, production rollout.

### SSH key read permissions (Ubuntu OpenSSH)

The restricted `authorized_keys` file is deliberately owned by `root:root` and mode `0644`, *not* `0600`: sshd may open the file after switching to the target staging user's UID. Public keys are not secret; root ownership and a root-owned parent directory prevent the staging user from changing the forced command. The private key remains mode `0600` on the client. If the public-key test returns `Permission denied (publickey)`, check target key fingerprint, `namei -l /home/heycity-staging-ci/.ssh/authorized_keys`, and sshd auth logs before changing anything else. Do not grant the user Docker access, disable StrictModes, or open password login.

### Binary image transport and Ubuntu sudo pseudo-TTY

The manual Actions deploy streams a Docker tar archive into the forced SSH command's stdin. On this VPS the default sudoers policy includes `use_pty`, which can pass input through terminal line discipline and corrupt a binary archive. For **the dedicated staging account only**, the root-owned `/etc/sudoers.d/heycity-staging-ci` must contain:

```sudoers
Defaults:heycity-staging-ci !use_pty
heycity-staging-ci ALL=(root) NOPASSWD: /usr/local/sbin/heycity-staging-deploy *
```

The bootstrap template now installs these directives. If the account was already installed from an earlier revision, an administrator must update **only** this staging sudoers file and run `visudo -cf /etc/sudoers.d/heycity-staging-ci` before the first archive transfer. Root ownership and `0440` permissions must remain. No global `Defaults` change, no production sudo changes. Verify SSH is still forced-command-only and the user is not in the Docker group.


## Release identity and iOS cloud preview (pending validation)

This section describes the next Draft rollout. It is **not evidence of a successful deploy or a signed iOS build**.

### Staging backend
- Use the existing manual `.github/workflows/staging-deploy.yml` on the default branch. Keep the environment approval variable `STAGING_APPROVED_SHA`, dedicated forced-command SSH identity, successful CI check, and production health gates. Never substitute the production SSH key.
- The root-owned receiver `ops/heycity-staging-deploy` now calculates the Docker image ID from the tar manifest's config bytes and compares it against the exact ID Docker reports **after** import. Matching source revision labels are not enough. Mismatches fail closed before Compose startup.
- Installing the updated receiver on the VPS is an **admin-only, reviewed deployment**. A change in GitHub does not update `/usr/local/sbin/heycity-staging-deploy` automatically. Retain the existing receiver and a recovery path until the new one is tested.
- At the 2026-11-01 field checkpoint, the CI artifact's config image ID was `sha256:6b2eb1a9260f69216248774f88d1b4dad89d314d1ba65888bb54ac1aa61a246b`, but the VPS image tag resolved to `sha256:c757151f1692ad455250796f54beecfa58cf9f0ce3b5098b93c1d67a0b362ac5`. Root cause **not proven**. Do not run the new server until the mismatch is resolved and production remains healthy.
- The hosted staging-deploy workflow currently rebuilds from an approved SHA rather than pulling the exact CI-produced image. Treat that as a separate build with its own provenance; do not claim byte identity with the CI artifact. Before accepting a future release pipeline, decide whether to retain this reviewed-source policy or enforce exact-artifact promotion.

### iOS standalone preview
- After the `.github/workflows/ios-preview.yml` workflow reaches the default branch through separately authorized activation, configure GitHub environment `ios-preview`, variable `IOS_PREVIEW_APPROVED_SHA`, and environment secret `EXPO_TOKEN`.
- Prepare signing/provisioning, iPhone registration, correct Expo project, and sensitive `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY` in the EAS `preview` environment outside the repository. Build requires functioning Apple developer signing. Do not add server provider secrets to mobile environment.
- Dispatch **Hey City iOS preview (manual)** with the same reviewed SHA. It verifies CI, builds with the existing `mobile/eas.json` preview profile, and reports the EAS build/install URL. EAS manages auto-increment of iOS build numbers.
- Verify actual installed build/source identity through EAS metadata and Settings before claiming device acceptance. A Mac, Xcode or physical iPhone is not available to this workflow; installation and outdoor driving tests remain manual.
- A cloud iOS build is optional until signing and required account access are confirmed. The current Mac fallback remains `bash ops/build-ios-field-release.sh FULL_SHA [UDID]` with its local native iOS project.

### Owner operation
1. Approve an exact reviewed SHA in the staging environment, then manually dispatch the isolated staging workflow on `main`.
2. Require staging API image ID, runtime revision, HTTPS health and unchanged production health evidence before requesting iOS cloud build.
3. Approve the same SHA in `ios-preview`, dispatch iOS preview, and install from the resulting EAS link.
4. If a verification gate fails, stop; do not re-tag an image, loosen signing checks, or bypass approval.

No app feature changes, M4 provider choice, production rollout or Draft PR merge is implied by this procedure.
