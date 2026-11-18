#!/usr/bin/env bash
# Runs a command with E2E_MOBILE / E2E_PASSWORD set. Order of precedence:
#   1. already exported in the shell, 2. ./.env (read by playwright itself), 3. ../api-test/.env (MOBILE_NUMBER / PASSWORD)
# Usage: ./scripts/with-env.sh npx playwright test tests/books
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${E2E_MOBILE:-}" && "${E2E_ENV:-local}" == "local" && ! -f .env && ! -f .env.local && -f ../api-test/.env ]]; then
  set -a; . ../api-test/.env; set +a
  export E2E_MOBILE="${MOBILE_NUMBER:-}" E2E_PASSWORD="${PASSWORD:-}"
fi
exec "$@"
