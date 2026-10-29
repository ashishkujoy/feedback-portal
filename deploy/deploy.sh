#!/bin/sh
# Deploys or updates the production stack (README → "Deploying"). From the repo root:
#   deploy/deploy.sh --build   # build the images on this host
#   deploy/deploy.sh --pull    # pull IMAGE_REGISTRY…:IMAGE_TAG (set in deploy/.env)
#   deploy/deploy.sh           # the images already here (e.g. a rollback to an earlier tag)
#
# Migrations run first, on their own. If one fails, the deploy stops there and the running app is
# left as it was. (`compose up` alone would already have replaced the api's container, so a failed
# migration would leave the site down.)
set -eu
compose() { docker compose -f "$(dirname "$0")/compose.yml" "$@"; }

case "${1:-}" in
  --build) compose build ;;
  --pull) compose pull ;;
  '') ;;
  *)
    echo "usage: $0 [--build | --pull]" >&2
    exit 2
    ;;
esac
compose run --rm migrate
compose up --detach --wait --remove-orphans
