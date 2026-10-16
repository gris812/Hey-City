#!/usr/bin/env bash
# Admin-only one-time installation: no Docker up / Nginx edits / production mutations.
# Usage (root): bash ops/bootstrap-staging-deployer.sh STAGING_PUBLIC_KEY STAGING_ENV_FILE
set -euo pipefail
umask 077
if [[ $(id -u) != 0 || $# != 2 ]]; then
  echo 'Usage (root): bash ops/bootstrap-staging-deployer.sh /path/to/staging.pub /path/to/.env.staging' >&2
  exit 64
fi
pubfile="$1"
envsource="$2"
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose_source="$here/../docker-compose.staging.yml"
for f in "$pubfile" "$envsource" "$compose_source" "$here/heycity-staging-ssh" "$here/heycity-staging-deploy"; do
  [[ -f "$f" && ! -L "$f" ]] || { echo 'Missing or symlinked bootstrap input' >&2; exit 78; }
done
[[ $(wc -l < "$pubfile") == 1 ]] || { echo 'Expected one public key line' >&2; exit 78; }
IFS=' ' read -r keytype keydata comment < "$pubfile"
[[ "$keytype" == ssh-ed25519 && "$keydata" =~ ^[A-Za-z0-9+/=]+$ ]] || {
  echo 'Expected plain Ed25519 staging public key' >&2; exit 78;
}
ssh-keygen -lf "$pubfile" >/dev/null
[[ $(stat -c '%a' "$envsource") == 600 ]] || { echo 'Environment file must be mode 600' >&2; exit 78; }
for path in /usr/local/sbin/heycity-staging-deploy /usr/local/bin/heycity-staging-ssh \
  /etc/sudoers.d/heycity-staging-ci /home/heycity-staging-ci/.ssh/authorized_keys \
  /opt/HeyCity-staging/.env.staging; do
  [[ ! -e "$path" ]] || { echo "Already configured: $path. Refusing overwrite." >&2; exit 78; }
done
command -v docker >/dev/null
command -v visudo >/dev/null
command -v python3 >/dev/null
if ! id heycity-staging-ci >/dev/null 2>&1; then
  useradd --create-home --home-dir /home/heycity-staging-ci --shell /bin/bash heycity-staging-ci
fi
passwd -l heycity-staging-ci >/dev/null
if id -nG heycity-staging-ci | tr ' ' '\n' | grep -qx docker; then
  echo 'Dedicated account must NOT be in docker group' >&2; exit 78
fi
chown root:root /home/heycity-staging-ci
chmod 0755 /home/heycity-staging-ci
install -d -o root -g root -m 0755 /home/heycity-staging-ci/.ssh
printf 'restrict,command="/usr/local/bin/heycity-staging-ssh" %s %s %s\n' \
  "$keytype" "$keydata" "${comment:-staging-ci}" \
  > /home/heycity-staging-ci/.ssh/authorized_keys
chown root:root /home/heycity-staging-ci/.ssh/authorized_keys
chmod 0600 /home/heycity-staging-ci/.ssh/authorized_keys
install -o root -g root -m 0755 "$here/heycity-staging-ssh" /usr/local/bin/heycity-staging-ssh
install -o root -g root -m 0700 "$here/heycity-staging-deploy" /usr/local/sbin/heycity-staging-deploy
install -d -o root -g root -m 0700 /opt/HeyCity-staging
install -o root -g root -m 0644 "$compose_source" /opt/HeyCity-staging/docker-compose.staging.yml
install -o root -g root -m 0600 "$envsource" /opt/HeyCity-staging/.env.staging
printf '%s\n' 'heycity-staging-ci ALL=(root) NOPASSWD: /usr/local/sbin/heycity-staging-deploy *' \
  > /etc/sudoers.d/heycity-staging-ci
chmod 0440 /etc/sudoers.d/heycity-staging-ci
if ! visudo -cf /etc/sudoers.d/heycity-staging-ci >/dev/null; then
  rm -f /etc/sudoers.d/heycity-staging-ci
  echo 'Staging sudo rule rejected' >&2
  exit 78
fi
echo 'staging_bootstrap=installed account=heycity-staging-ci'
echo 'Next: configure a new staging-only HTTPS vhost through an administrator.'
