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
3. For the **SSH access bootstrap only**, staging credentials are not required yet. Later, prepare a separate, untracked `.env.staging` on the VPS from PR #19's `ops/staging.env.example`, permission `600`, with staging-only JWT/OTP/database credentials, scoped external-provider keys, tester allowlist, quotas, Resend sender and `NODE_ENV=staging`. **Never copy production env, DB, media, or secrets.** Do not print this file or share credential values.
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

If any required environment configuration, permission restriction, successful CI or HTTPS certificate is missing, **stop**; do not fall back to production keys/account or try running the workflow from an unreviewed PR branch.

## Acceptance / rollback

Acceptance requires that the staging identity cannot open a shell or use Docker/sudo outside its forced command; invalid SHA and malformed image are rejected; running image revision is recorded; API remains loopback `127.0.0.1:4110`; DB/media networks and volumes do not connect to production; public staging HTTPS health and production HTTPS health both pass. Test OTP, media, spending budgets, native build and live M4 B1–B6 separately.

On staging failure, the receiver stops only staging services, retaining staging DB/media for diagnosis. Administrator rollback must use the previous reviewed staging SHA and never use `docker system prune`, `down -v`, production project, or production SSH credentials.

**Not completed here:** VPS bootstrap, GitHub environment/secrets, Nginx/Certbot setup, actual deployment, native iOS build, M4 acceptance, production rollout.

### SSH key read permissions (Ubuntu OpenSSH)

The restricted `authorized_keys` file is deliberately owned by `root:root` and mode `0644`, *not* `0600`: sshd may open the file after switching to the target staging user's UID. Public keys are not secret; root ownership and a root-owned parent directory prevent the staging user from changing the forced command. The private key remains mode `0600` on the client. If the public-key test returns `Permission denied (publickey)`, check target key fingerprint, `namei -l /home/heycity-staging-ci/.ssh/authorized_keys`, and sshd auth logs before changing anything else. Do not grant the user Docker access, disable StrictModes, or open password login.
