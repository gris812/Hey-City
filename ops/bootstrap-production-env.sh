#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${repo_root}/.env.production"

if [[ -e "${env_file}" && "${1:-}" != "--replace" ]]; then
  echo "${env_file} already exists; refusing to overwrite it."
  echo "Run with --replace only if you intentionally want new credentials."
  exit 1
fi

command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required to generate production secrets."
  exit 1
}

read_secret() {
  local prompt="$1"
  local value=""

  while [[ -z "${value}" ]]; do
    read -r -s -p "${prompt}: " value
    echo
  done

  printf '%s' "${value}"
}

google_server_key="$(read_secret 'Google server API key')"
google_browser_key="$(read_secret 'Google browser API key')"
openai_key="$(read_secret 'OpenAI API key')"
resend_key="$(read_secret 'Resend API key')"
admin_code="$(read_secret 'Admin sign-in code')"

postgres_password="$(openssl rand -hex 32)"
jwt_secret="$(openssl rand -hex 48)"
otp_pepper="$(openssl rand -hex 48)"

umask 077
cat >"${env_file}" <<EOF
NODE_ENV=production
PORT=4000
PUBLIC_API_URL=https://api.heycity.stolbergco.com
CORS_ORIGINS=https://heycity.stolbergco.com
DATABASE_SSL=false
POSTGRES_PASSWORD=${postgres_password}
JWT_SECRET=${jwt_secret}
OTP_PEPPER=${otp_pepper}
RESEND_API_KEY=${resend_key}
AUTH_FROM_EMAIL="Hey City <login@heycity.stolbergco.com>"
ADMIN_EMAIL=slepak@stolbergco.com
ADMIN_AUTH_CODE=${admin_code}
TESTER_EMAIL_ALLOWLIST=slepak@stolbergco.com,g.slepak@icloud.com,albert.slepak@gmail.com,olga_gavrilova@me.com
USAGE_RETENTION_DAYS=30
GOOGLE_MAPS_API_KEY=${google_server_key}
GOOGLE_MAPS_BROWSER_KEY=${google_browser_key}
OPENAI_API_KEY=${openai_key}
OPENAI_TEXT_MODEL=gpt-5.6-luna
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TEXT_INPUT_USD_PER_MILLION=0.10
OPENAI_TEXT_OUTPUT_USD_PER_MILLION=0.60
OPENAI_TTS_INPUT_USD_PER_MILLION=0.60
OPENAI_TTS_OUTPUT_USD_PER_MILLION=12.00
GOOGLE_PLACES_USD_PER_THOUSAND=32.00
GOOGLE_GEOCODING_USD_PER_THOUSAND=5.00
GOOGLE_MATRIX_ELEMENT_USD_PER_THOUSAND=5.00
GOOGLE_DYNAMIC_MAP_USD_PER_THOUSAND=7.00
MEDIA_DIRECTORY=/app/data/media
EOF

chmod 600 "${env_file}"
echo "Created ${env_file} with mode 600."
