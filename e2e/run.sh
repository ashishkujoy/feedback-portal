#!/bin/sh
# `pnpm e2e`: build the production stack with the test overrides, start it, run Playwright against
# it, then remove it all. Not `up --exit-code-from`: that stops everything as soon as the one-shot
# migrate job exits.
here=$(dirname "$0")
compose() {
  docker compose -f "$here/../deploy/compose.yml" -f "$here/compose.yml" \
    --env-file "$here/e2e.env" "$@"
}

compose build &&
  compose up --detach --wait web &&
  compose run --rm playwright
status=$?
if [ "$status" -ne 0 ]; then
  mkdir -p "$here/test-results" &&
    compose logs --no-color api fake-google > "$here/test-results/stack.log" 2>&1
fi
compose down --volumes --remove-orphans
exit "$status"
