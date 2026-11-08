# Hey City staging automation — installation and activation

Status: **backend release verified; iOS cloud acceptance pending**. Owner-authorized release workflows are active on `main` at `97fce75`; restricted receiver/tooling `eb7fb8e` is installed. Read-only inspect #2 and staging deploy #3 passed on the VPS. This file is the canonical automation/setup procedure. Application/Compose/TLS, identity diagnosis and rollback are in adjacent `ops/STAGING_DEPLOYMENT.md`.

## Architecture

The current `heycity-deploy` is Docker-enabled: membership in Docker effectively grants root-level access to ALL containers on this VPS. Reusing that login or the production GitHub SSH secrets for staging is prohibited.

The automation instead uses a new locked-password account `heycity-staging-ci`, with **no Docker group and no unrestricted sudo**. Its root-owned `authorized_keys` forces `ops/heycity-staging-ssh`, accepting only `deploy <40-hex Git SHA>` or read-only `diagnose <40-hex Git SHA>` / `inspect <40-hex Git SHA> <sha256:config-digest>`. A sudoers rule allows only the root-owned `/usr/local/sbin/heycity-staging-deploy` helper. The helper validates the incoming Docker image archive and Git revision label and updates **only** `heycity-staging`, using a root-owned staging Compose manifest and separate root-owned environment file.

The Actions workflow is `workflow_dispatch` **only**, executable exclusively from `main`. It requires the requested SHA to equal the separately approved GitHub **staging environment variable** `STAGING_APPROVED_SHA`, and requires a successful `validate` check on that SHA. It builds linux/amd64 on a GitHub runner from the approved source, validates archive config/layers, then transmits those same bytes using separate staging SSH secrets. This is a fresh reviewed-source build with its own provenance, not a claim of identity with an expired historical CI artifact. It has no PR event and no production deploy step.

This does not provide complete VPS isolation: all projects share the host, Docker daemon and memory. Keep resource caps; do not grant the staging account Docker access.

## Historical bootstrap — new VPS only (operator/admin)

The existing VPS account/receiver is already installed. Routine releases use **Release operation — PR #31** below; this bootstrap block is only for a new host. The one-time receiver upgrade was completed and does not need repeating for each release.

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

## Activation status

Owner-authorized activation published only `.github/workflows/staging-deploy.yml`, `ios-preview.yml` and `release-workflow-validation.yml` on `main` in commit `97fce755c2e7d24b5b3c9acd228acae1b1b728ae`. Their paths do not trigger the existing production workflow. Product PRs #22/#27/#28/#31 remain Draft/unmerged. The staging workflow was exercised operationally via owner-authorized Browser dispatch; subsequent failed-job retries are also supported by the GitHub connector.

If any required environment configuration, permission restriction, successful CI or HTTPS certificate is missing, **stop**; never fall back to production SSH keys/account, database or authentication secrets, and never run the workflow from an unreviewed PR branch. The limited and explicitly authorized sharing of three *external provider* key values is documented in `ops/STAGING_DEPLOYMENT.md`.

## Acceptance / rollback

Acceptance requires that the staging identity cannot open a shell or use Docker/sudo outside its forced command; invalid SHA and malformed image are rejected; running image revision is recorded; API remains loopback `127.0.0.1:4110`; DB/media networks and volumes do not connect to production; public staging HTTPS health and production HTTPS health both pass. Test OTP, media, spending budgets, native build and live M4 B1–B6 separately.

On failed API activation, the receiver restores the exact retained previous image and verifies its running ID and pre-deployment health. PostgreSQL/media are preserved. A failed rollback requires an administrator; never use `docker system prune`, `down -v`, the production project or production SSH credentials. The behavior is covered by automated regressions; a live failure/restore drill has not been executed on this VPS.

**Operationally verified:** restricted SSH, receiver upgrade, exact config/layer identity diagnosis and staging API deployment with HTTPS/source/production-health checks. **Still pending:** signed cloud iOS build/install, physical acceptance and live M4 benchmark. Production rollout is outside scope.

### SSH key read permissions (Ubuntu OpenSSH)

The restricted `authorized_keys` file is deliberately owned by `root:root` and mode `0644`, *not* `0600`: sshd may open the file after switching to the target staging user's UID. Public keys are not secret; root ownership and a root-owned parent directory prevent the staging user from changing the forced command. The private key remains mode `0600` on the client. If the public-key test returns `Permission denied (publickey)`, check target key fingerprint, `namei -l /home/heycity-staging-ci/.ssh/authorized_keys`, and sshd auth logs before changing anything else. Do not grant the user Docker access, disable StrictModes, or open password login.

### Binary image transport and Ubuntu sudo pseudo-TTY

The manual Actions deploy streams a Docker tar archive into the forced SSH command's stdin. On this VPS the default sudoers policy includes `use_pty`, which can pass input through terminal line discipline and corrupt a binary archive. For **the dedicated staging account only**, the root-owned `/etc/sudoers.d/heycity-staging-ci` must contain:

```sudoers
Defaults:heycity-staging-ci !use_pty
heycity-staging-ci ALL=(root) NOPASSWD: /usr/local/sbin/heycity-staging-deploy *
```

The bootstrap template now installs these directives. If the account was already installed from an earlier revision, an administrator must update **only** this staging sudoers file and run `visudo -cf /etc/sudoers.d/heycity-staging-ci` before the first archive transfer. Root ownership and `0440` permissions must remain. No global `Defaults` change, no production sudo changes. Verify SSH is still forced-command-only and the user is not in the Docker group.


## Release operation — PR #31

PR #31 depends directly on PR #28 (`bb6a9ad539c7fb6db433671c602a51e63c45d9e5`). Keep the complete product chain Draft. The CLI checks that the selected open same-repository PR contains its current base SHA and has successful exact-head validation. An owner still reviews/authorizes the full release SHA; a green check is not release approval.

### One-time activation and access

- **Completed:** only the three reviewed release workflow files are active on `main` at `97fce75`, with owner authorization. The application Draft chain remains unmerged. Keep runtime tooling pinned separately; copying `ops/`/`mobile/` changes onto `main` could trigger the existing production workflow and is not an activation shortcut.
- Pin `RELEASE_TOOLING_SHA` to the reviewed full PR #31 commit in both protected `staging` and `ios-preview` Environments. The workflow moves its separate tools checkout out of the application source archive. Maintain main-only branch restriction and required reviewer where supported. Use the four existing STAGING_SSH_* secrets only, dedicated account, host-key verification and forced command. No root/production key in Actions.
- **Completed:** the owner installed the reviewed root-owned receiver, forced-command script and `/usr/local/lib/heycity/image_identity.py` from `eb7fb8e`; subsequent inspect proved execution through the restricted account. Existing bootstrap refuses overwriting accounts/configuration; upgrade only these code files, preserving sudoers, Compose and mode-600 staging env. Validate with `bash -n`/`visudo -cf`; do not replace DB/media/configuration. Root installation rights do not pass to CI.
- Historical diagnosis passed in inspect run #2 attempt 2. For a later read-only audit, use `operation=inspect`, the approved source SHA and the config digest recorded for the current deployed build (command below). This exports only the loaded staging image, validates its exact config/layers and reports engine/store/manifest correspondence; no original TAR, Docker load or service changes are required. Resolve the reported identity/store correspondence before authorizing deploy. Set `STAGING_APPROVED_SHA` and `IOS_PREVIEW_APPROVED_SHA` to the same reviewed application SHA. Set `EAS_CLOUD_BUILD_AUTHORIZED=true` only after cloud-build/account access is authorized. Put EXPO_TOKEN directly in protected `ios-preview` secret, never chat/source/logs. The current connector cannot dispatch workflows or configure Environments; an authenticated GitHub CLI or explicit UI authorization is needed. Direct SSH from this runtime remains unavailable, but GitHub runner SSH is verified. Current deployment #3 passed staging HTTPS/source/capabilities and unchanged production-health checks.
- EAS project remains `554718b7-7f37-4cbb-89d0-cec6fe193fb5` under organization `stolberg-usa` (owner login `grislepak`), bundle `com.sunshine.aiguide`. Project ID and restricted public iOS Maps key presence in Expo `preview` were verified in the dashboard. The owner completed paid Apple Developer activation and reported an active ad-hoc profile containing the test iPhone. `EXPO_TOKEN` is saved directly in protected GitHub `ios-preview`; its value was not inspected. Personal Team alone does not supply cloud distribution. Do not buy membership/build plans or change accounts automatically; no backend provider credentials.
- Smallest signing setup if not already complete: from `mobile/`, an authorized Expo/Apple owner runs `npx eas-cli@27.5.0 device:create`, then `npx eas-cli@27.5.0 credentials:configure-build --platform ios --profile preview`. These initialize device provisioning and remote credentials without submitting a build. Reuse an existing valid distribution certificate. The previous CLI 16.28.0 attempt created a certificate but failed with Apple 401 while handling ad-hoc profiles; setup succeeded after using 27.5.0. This is observed recovery, not proof of the underlying Apple 401 cause. If remote build numbering must continue an existing series, seed it once with `eas build:version:set`. Workflow uses remote `appVersionSource` plus preview `autoIncrement`, and `--freeze-credentials`; it cannot repair missing signing interactively.

### Owner command

Request: **“Release Hey City staging from PR #N.”** An operator with reviewed tooling and an existing authenticated `gh` runs:

```bash
python3 ops/prepare-release.py N
# Read-only audit of the currently deployed build (historical config was different):
gh workflow run staging-deploy.yml --repo gris812/Hey-City --ref main \
  -f operation=inspect -f commit_sha=bb6a9ad539c7fb6db433671c602a51e63c45d9e5 \
  -f expected_config_digest=sha256:0c47fb12389ce012d72938594ec45d07d06b91062b368d0a4123dd75baa2b173
# After exact SHA/Environment authorization, use the emitted commands:
gh workflow run staging-deploy.yml --repo gris812/Hey-City --ref main -f commit_sha=FULL_SHA
# Wait for success, actual image/config receipt and matching HTTPS source first:
gh workflow run ios-preview.yml --repo gris812/Hey-City --ref main -f commit_sha=FULL_SHA
```

Staging builds from the approved source; records TAR checksum, config digest, source and platform; validates the fresh post-load export; updates only `api --no-deps`; and reports actual running ID plus rollback tag. It requires healthy existing PostgreSQL and available memory/disk. Public HTTPS revision/capability and production health checks are in the receiver's rollback boundary. Retrying checks all gates again, never creates a second API service, and retains the current running image as the next rollback target. See `STAGING_DEPLOYMENT.md` for failure behavior and known limitations.

The iOS workflow checks matching staging SHA before submission, uses pinned EAS CLI 27.5.0 on Node 22, bundled Release/internal profile and remote signing. It overlays only public staging/SHA metadata and preview version configuration; production profile/assets/identity are preserved. `ops/ios_preview.py` requires exactly one FINISHED iOS result with the approved gitCommitHash, native build number and an install/dashboard URL. Failed/canceled/timed-out cloud builds are not success. If reporting fails after build submission, inspect the existing EAS build ID before retrying; do not create duplicate builds blindly. Physical installation is manual.

### Artifact storage and acceptance

PR/push CI builds images for validation but uploads no large artifacts. Explicit validation dispatch can retain one compressed image for **one day**, with upload compression disabled; this is an optional recovery export, not a dependency of staging deployment. Each export is approximately 224 MB in the last measured run, so two retained copies nearly exhaust a 0.5 GB allowance. Do not delete historical artifacts automatically or raise paid storage limits. Normal staging releases stream from ephemeral runner storage and retain the previous image on VPS; no routine Mac transfer or registry service is introduced.

The CI suite checks archive/source/platform/layer rejection, malformed input and cleanup, engine-ID differences with exact content proof, diagnosis without mutation, API-only updates and health-failure rollback. EAS tests reject stale/unfinished/multiple results and unsafe links. These automated results do not establish VPS deployment/rollback, signing, install or physical acceptance.

Final release report: PR/full source SHA and dependency; CI/run; archive/config/engine/running IDs; previous image/rollback tag; HTTPS/capability and production pre/post status; EAS build ID/native version/install link; automated vs physical evidence; remaining gates. **Do not create/install Hey City Release skill until operational backend and iOS pipeline acceptance passes.**

## One-time upgrade of an already installed staging receiver

Operational evidence: owner-authorized workflow activation is on `main` at `97fce755c2e7d24b5b3c9acd228acae1b1b728ae`; product PRs remain Draft. Read-only inspect run [#2 attempt 1](https://github.com/gris812/Hey-City/actions/runs/42316561697) passed source/CI gates and established the restricted SSH connection, then the existing VPS wrapper returned `Unauthorized staging operation`, exit 64. No image build/load/deployment occurred. This demonstrates an outdated or differently configured forced-command implementation; do not weaken it or substitute another SSH identity.

An authorized administrator runs the following **once in a root terminal on the VPS**. It downloads only the three reviewed files from immutable tooling commit `eb7fb8e`, verifies their SHA256 before any installation, serializes with the existing deployment lock, retains old code, and atomically replaces only receiver/wrapper/verifier. It does not alter sudoers, Compose, environment secrets, PostgreSQL/media, Nginx or running services. The repository is public, so no GitHub credentials are required for these downloads. The owner executed this block successfully: `receiver_upgrade=installed`, backup `/opt/HeyCity-staging/receiver-backup.kSEURwBK`; inspect #2 attempt 2 subsequently passed. Retain the block for recovery rather than repeating it for routine releases.

```bash
(
set -euo pipefail
[ "$(id -u)" = 0 ]
stg_upgrade_dir=$(mktemp -d /root/heycity-receiver.XXXXXXXX)
trap 'rm -rf "$stg_upgrade_dir"' EXIT
exec 9>/run/lock/heycity-staging-deploy.lock
flock -n 9
for stg_file in heycity-staging-deploy heycity-staging-ssh image_identity.py; do
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --max-time 60 \
    "https://raw.githubusercontent.com/gris812/Hey-City/eb7fb8e0eb8f1b7c17d30ea460a7cc4b58eff3cb/ops/$stg_file" \
    -o "$stg_upgrade_dir/$stg_file"
done
(cd "$stg_upgrade_dir"; sha256sum -c <<'SUMS'
73d9826c17e06b2b6f14bcce4a02d811a8ee781604c6bae845426d85a5b484ec  heycity-staging-deploy
647787984f4b61ca32c911474ed45eaeddc9ea7b5f1588a63d5fdf1c8e9a143a  heycity-staging-ssh
9d4117902c9900b4eb420018509615e0271d7f6f174c90c0b71e1313311fa353  image_identity.py
SUMS
)
bash -n "$stg_upgrade_dir/heycity-staging-deploy"
bash -n "$stg_upgrade_dir/heycity-staging-ssh"
python3 -c 'import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(),sys.argv[1],"exec")' "$stg_upgrade_dir/image_identity.py"
stg_backup_dir=$(mktemp -d /opt/HeyCity-staging/receiver-backup.XXXXXXXX)
chmod 700 "$stg_backup_dir"
for stg_old in /usr/local/sbin/heycity-staging-deploy /usr/local/bin/heycity-staging-ssh; do
  [ -f "$stg_old" ] && [ ! -L "$stg_old" ] && [ "$(stat -c %u "$stg_old")" = 0 ]
  cp -p "$stg_old" "$stg_backup_dir/"
done
if [ -e /usr/local/lib/heycity/image_identity.py ]; then
  [ ! -L /usr/local/lib/heycity/image_identity.py ]
  cp -p /usr/local/lib/heycity/image_identity.py "$stg_backup_dir/"
fi
install -d -o root -g root -m 0755 /usr/local/lib/heycity
install -o root -g root -m 0644 "$stg_upgrade_dir/image_identity.py" /usr/local/lib/heycity/image_identity.py.next
mv -f /usr/local/lib/heycity/image_identity.py.next /usr/local/lib/heycity/image_identity.py
install -o root -g root -m 0700 "$stg_upgrade_dir/heycity-staging-deploy" /usr/local/sbin/heycity-staging-deploy.next
mv -f /usr/local/sbin/heycity-staging-deploy.next /usr/local/sbin/heycity-staging-deploy
install -o root -g root -m 0755 "$stg_upgrade_dir/heycity-staging-ssh" /usr/local/bin/heycity-staging-ssh.next
mv -f /usr/local/bin/heycity-staging-ssh.next /usr/local/bin/heycity-staging-ssh
visudo -cf /etc/sudoers.d/heycity-staging-ci
printf 'receiver_upgrade=installed tooling_sha=eb7fb8e0eb8f1b7c17d30ea460a7cc4b58eff3cb backup=%s\n' "$stg_backup_dir"
)
```

The historical inspect job (run #2 attempt 2) passed and resolved the incident before deployment #3. That deploy is a fresh build of the same source and replaced the SHA tag with a new verified config digest; do not rerun the historical 6b2eb1a expectation against the current tag. Use the current config digest above for a fresh audit. Keep the printed backup directory until operational acceptance. Restore those saved code files with root-owned modes if installation must be reverted; this is separate from application-image rollback. Never expose private SSH keys or staging environment contents.

GitHub configuration was verified after owner reauthentication: staging retains main-only restriction and its four existing secret names; approved source is `bb6a9ad…`, release tooling `eb7fb8e…`. Separate `ios-preview` is main-only with the same source/tooling pins and `EAS_CLOUD_BUILD_AUTHORIZED=false`; it has no EXPO_TOKEN yet. Enable cloud submission only after the existing Expo/Apple credentials and device provisioning are confirmed.
